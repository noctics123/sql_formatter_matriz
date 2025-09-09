class FieldFormatter {
    constructor(options = {}) {
        this.maxCharsPerLine = options.maxCharsPerLine || 30000; // Reducir un poco para margen
        this.excelMaxChars = options.excelMaxChars || 32500; // Dejar margen de seguridad para Excel
        this.indentSize = options.indentSize || 4;
        this.preserveCommaPosition = options.preserveCommaPosition !== false; // Por defecto true
        this.fieldSeparator = options.fieldSeparator || '    '; // 4 espacios por defecto
        this.aggressivePacking = options.aggressivePacking !== false; // Empaquetado agresivo por defecto
    }

    /**
     * Actualiza la configuración del formateador
     */
    updateSettings(settings) {
        if (settings.maxCharsPerLine) this.maxCharsPerLine = settings.maxCharsPerLine;
        if (settings.excelMaxChars) this.excelMaxChars = settings.excelMaxChars;
        if (settings.indentSize) this.indentSize = settings.indentSize;
        if (settings.preserveCommaPosition !== undefined) this.preserveCommaPosition = settings.preserveCommaPosition;
    }

    /**
     * Formatea una lista de campos horizontalmente
     */
    formatFields(fields, isForExcel = false) {
        if (!fields || fields.length === 0) {
            return '';
        }

        // Validar y limpiar campos
        const validFields = this.validateAndCleanFields(fields);
        if (validFields.length === 0) {
            return '';
        }

        const maxChars = isForExcel ? this.excelMaxChars : this.maxCharsPerLine;
        const indent = ' '.repeat(this.indentSize);
        
        if (this.aggressivePacking) {
            return this.arrangeFieldsAggressively(validFields, maxChars, indent);
        } else {
            return this.arrangeFieldsHorizontally(validFields, maxChars, indent);
        }
    }

    /**
     * Valida y limpia campos asegurando que solo se formateen campos reales
     */
    validateAndCleanFields(fields) {
        const cleanFields = [];
        
        fields.forEach(field => {
            const trimmedField = field.trim();
            
            // Ignorar campos vacíos
            if (!trimmedField) return;
            
            // Verificar que es realmente un campo y no una palabra clave SQL perdida
            if (this.isActualField(trimmedField)) {
                cleanFields.push(trimmedField);
            }
        });
        
        return cleanFields;
    }

    /**
     * Determina si un string es realmente un campo y no una palabra clave SQL
     */
    isActualField(fieldStr) {
        const upperField = fieldStr.toUpperCase().trim();
        
        // Lista de palabras clave que NO son campos
        const sqlKeywords = [
            'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 
            'OFFSET', 'UNION', 'UNION ALL', 'MINUS', 'MINUS ALL', 'INTERSECT', 
            'EXCEPT', 'WITH', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
            'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'USING', 'AND', 
            'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL',
            'TRUE', 'FALSE', 'DISTINCT', 'ALL', 'FILTER'
        ];
        
        // Si comienza con una palabra clave SQL pura, no es un campo
        for (const keyword of sqlKeywords) {
            if (upperField.startsWith(keyword + ' ') || upperField === keyword) {
                return false;
            }
        }
        
        // Verificar patrones válidos de campos
        return this.hasValidFieldPattern(fieldStr);
    }

    /**
     * Verifica si tiene patrones válidos de campos SQL
     */
    hasValidFieldPattern(fieldStr) {
        const upperField = fieldStr.toUpperCase().trim();
        
        // Patrones válidos de campos:
        
        // 1. Campos simples: campo, tabla.campo, alias.campo
        if (/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*(\s+AS\s+[a-zA-Z_][a-zA-Z0-9_]*)?$/i.test(fieldStr)) {
            return true;
        }
        
        // 2. Funciones agregadas: SUM(campo), COUNT(*), AVG(campo), etc.
        if (/^(SUM|COUNT|AVG|MIN|MAX|STDDEV|VARIANCE)\s*\(/i.test(upperField)) {
            return true;
        }
        
        // 3. Funciones de fecha: TO_DATE, EXTRACT, etc.
        if (/^(TO_DATE|TO_CHAR|EXTRACT|DATE_TRUNC|ADD_MONTHS|MONTHS_BETWEEN)\s*\(/i.test(upperField)) {
            return true;
        }
        
        // 4. Funciones de string: SUBSTR, CONCAT, TRIM, etc.
        if (/^(SUBSTR|SUBSTRING|CONCAT|TRIM|LTRIM|RTRIM|UPPER|LOWER|INITCAP|LENGTH|INSTR)\s*\(/i.test(upperField)) {
            return true;
        }
        
        // 5. Funciones analíticas: ROW_NUMBER(), RANK(), etc.
        if (/^(ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE)\s*\(/i.test(upperField)) {
            return true;
        }
        
        // 6. CASE WHEN expressions
        if (/^CASE\s+/i.test(upperField)) {
            return true;
        }
        
        // 7. Expresiones matemáticas y cálculos
        if (/^[a-zA-Z_][a-zA-Z0-9_.\s]*[\+\-\*\/\%]/i.test(fieldStr) || 
            /[\+\-\*\/\%][a-zA-Z_][a-zA-Z0-9_.\s]*/i.test(fieldStr)) {
            return true;
        }
        
        // 8. Constantes y literales con alias
        if (/^(['"].*['"]|\d+(\.\d+)?)\s+AS\s+[a-zA-Z_]/i.test(fieldStr)) {
            return true;
        }
        
        // 9. Subconsultas como campos
        if (/^\s*\(\s*SELECT\s+/i.test(fieldStr)) {
            return true;
        }
        
        // 10. Campos con operadores de comparación en contextos específicos
        if (fieldStr.includes('(') && fieldStr.includes(')')) {
            // Es probable que sea una función o expresión compleja
            return true;
        }
        
        return false;
    }

    /**
     * Organiza los campos horizontalmente respetando el límite de caracteres
     * Versión optimizada para maximizar campos por línea
     */
    arrangeFieldsHorizontally(fields, maxChars, indent) {
        if (fields.length === 0) return '';
        
        const lines = [];
        let currentLine = '';
        let currentLineFieldCount = 0;
        
        // Reservar espacio para indentación
        const availableChars = maxChars - indent.length;

        for (let i = 0; i < fields.length; i++) {
            const field = fields[i].trim();
            const isLast = i === fields.length - 1;
            
            // Determinar si agregar coma
            const fieldWithComma = this.shouldAddComma(field, isLast) ? field + ',' : field;
            
            // Calcular longitud si agregamos este campo
            let testLineLength;
            if (currentLine === '') {
                // Primera campo de la línea
                testLineLength = fieldWithComma.length;
            } else {
                // Agregar separador + campo
                testLineLength = currentLine.length + this.fieldSeparator.length + fieldWithComma.length;
            }

            // Verificar si cabe en la línea actual
            if (testLineLength <= availableChars) {
                // Cabe, agregarlo
                if (currentLine === '') {
                    currentLine = fieldWithComma;
                } else {
                    currentLine += this.fieldSeparator + fieldWithComma;
                }
                currentLineFieldCount++;
            } else {
                // No cabe, finalizar línea actual e iniciar nueva
                if (currentLine !== '') {
                    // Asegurar que termina en coma si no es la última línea
                    currentLine = this.ensureCommaEnding(currentLine, !isLast);
                    lines.push(indent + currentLine);
                }
                
                // Iniciar nueva línea con el campo actual
                currentLine = fieldWithComma;
                currentLineFieldCount = 1;
            }

            // Si es el último campo, agregar la línea final
            if (isLast && currentLine !== '') {
                lines.push(indent + currentLine);
            }
        }

        return lines.join('\n');
    }

    /**
     * Método de empaquetado agresivo para maximizar campos por línea
     * Similar a tu resultado esperado con múltiples campos por línea
     */
    arrangeFieldsAggressively(fields, maxChars, indent) {
        if (fields.length === 0) return '';
        
        const lines = [];
        let currentLine = '';
        const availableChars = maxChars - indent.length;
        
        // Usar separador mínimo para maximizar espacio
        const minSeparator = '    '; // 4 espacios como en tu ejemplo
        
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i].trim();
            const isLast = i === fields.length - 1;
            
            // Determinar si agregar coma
            const fieldWithComma = this.shouldAddComma(field, isLast) ? field + ',' : field;
            
            // Calcular si cabe en la línea actual
            let proposedLine;
            if (currentLine === '') {
                proposedLine = fieldWithComma;
            } else {
                proposedLine = currentLine + minSeparator + fieldWithComma;
            }

            // Si cabe, agregarlo; si no, crear nueva línea
            if (proposedLine.length <= availableChars) {
                currentLine = proposedLine;
            } else {
                // Línea llena, guardarla e iniciar nueva
                if (currentLine !== '') {
                    // Asegurar terminación en coma si no es la última línea
                    currentLine = this.ensureCommaEnding(currentLine, !isLast);
                    lines.push(indent + currentLine);
                }
                currentLine = fieldWithComma;
            }

            // Si es el último campo, agregar la línea final
            if (isLast && currentLine !== '') {
                lines.push(indent + currentLine);
            }
        }

        return lines.join('\n');
    }

    /**
     * Determina si un campo debe tener coma
     */
    shouldAddComma(field, isLast) {
        if (isLast) {
            return false;
        }
        
        // Si el campo ya termina en coma, no agregar otra
        if (field.trim().endsWith(',')) {
            return false;
        }
        
        return true;
    }

    /**
     * Asegura que la línea termine en coma si es necesario
     */
    ensureCommaEnding(line, needsComma) {
        if (!needsComma) {
            return line;
        }

        const trimmedLine = line.trim();
        if (!trimmedLine.endsWith(',')) {
            return line + ',';
        }
        
        return line;
    }

    /**
     * Formatea campos para Excel con manejo especial de límites
     */
    formatForExcel(fields) {
        if (!fields || fields.length === 0) {
            return [];
        }

        const formattedText = this.formatFields(fields, true);
        const lines = formattedText.split('\n');
        const excelRows = [];

        lines.forEach(line => {
            if (line.trim()) {
                if (line.length > this.excelMaxChars) {
                    // Dividir línea que excede el límite de Excel
                    const chunks = this.splitLineForExcel(line);
                    chunks.forEach(chunk => {
                        excelRows.push([chunk]);
                    });
                } else {
                    excelRows.push([line]);
                }
            }
        });

        return excelRows;
    }

    /**
     * Divide una línea para que cumpla con el límite de Excel
     */
    splitLineForExcel(line) {
        const chunks = [];
        let currentChunk = '';
        const indent = ' '.repeat(this.indentSize);
        
        // Separar por palabras para dividir de manera inteligente
        const words = line.trim().split(/(\s+|,\s*)/);
        let isFirstChunk = true;

        for (const word of words) {
            const testChunk = currentChunk ? currentChunk + word : word;
            
            // Para el primer chunk, incluir indentación
            const testChunkWithIndent = isFirstChunk 
                ? (currentChunk ? indent + testChunk : indent + word)
                : testChunk;

            if (testChunkWithIndent.length <= this.excelMaxChars) {
                currentChunk = testChunk;
            } else {
                if (currentChunk) {
                    const chunkWithIndent = isFirstChunk ? indent + currentChunk : currentChunk;
                    chunks.push(chunkWithIndent);
                    isFirstChunk = false;
                }
                currentChunk = word;
            }
        }

        if (currentChunk) {
            const chunkWithIndent = isFirstChunk ? indent + currentChunk : currentChunk;
            chunks.push(chunkWithIndent);
        }

        return chunks.length > 0 ? chunks : [line];
    }

    /**
     * Calcula estadísticas de formateo
     */
    calculateStats(originalFields, formattedText) {
        const originalLineCount = originalFields.length;
        const formattedLineCount = formattedText.split('\n').filter(line => line.trim()).length;
        const totalChars = formattedText.length;
        const reduction = originalLineCount > 0 
            ? Math.round(((originalLineCount - formattedLineCount) / originalLineCount) * 100) 
            : 0;

        return {
            originalFields: originalLineCount,
            formattedLines: formattedLineCount,
            totalCharacters: totalChars,
            reductionPercent: Math.max(0, reduction),
            averageFieldsPerLine: formattedLineCount > 0 
                ? Math.round(originalFields.length / formattedLineCount * 10) / 10 
                : 0
        };
    }

    /**
     * Valida que los campos estén bien formateados
     */
    validateFields(fields) {
        const errors = [];
        
        if (!Array.isArray(fields)) {
            errors.push('Los campos deben ser un array');
            return { isValid: false, errors };
        }

        fields.forEach((field, index) => {
            if (typeof field !== 'string') {
                errors.push(`Campo ${index + 1}: debe ser una cadena de texto`);
            } else if (field.trim() === '') {
                errors.push(`Campo ${index + 1}: no puede estar vacío`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Optimiza el formateo buscando el mejor balance entre líneas y legibilidad
     */
    optimizeFormatting(fields, targetLinesReduction = 80) {
        if (!fields || fields.length === 0) {
            return this.formatFields(fields);
        }

        const validation = this.validateFields(fields);
        if (!validation.isValid) {
            throw new Error('Campos inválidos: ' + validation.errors.join(', '));
        }

        // Probar diferentes configuraciones para encontrar el óptimo
        const originalMaxChars = this.maxCharsPerLine;
        const configurations = [
            { maxChars: Math.floor(originalMaxChars * 0.8) },
            { maxChars: originalMaxChars },
            { maxChars: Math.floor(originalMaxChars * 1.2) }
        ];

        let bestConfig = null;
        let bestResult = null;
        let bestScore = -1;

        for (const config of configurations) {
            this.maxCharsPerLine = config.maxChars;
            const formatted = this.formatFields(fields);
            const stats = this.calculateStats(fields, formatted);
            
            // Calcular puntuación basada en reducción de líneas y legibilidad
            const reductionScore = Math.min(stats.reductionPercent / targetLinesReduction, 1) * 50;
            const readabilityScore = Math.min(stats.averageFieldsPerLine / 5, 1) * 50;
            const totalScore = reductionScore + readabilityScore;

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestConfig = config;
                bestResult = { formatted, stats };
            }
        }

        // Restaurar configuración original
        this.maxCharsPerLine = originalMaxChars;

        return bestResult ? bestResult.formatted : this.formatFields(fields);
    }
}