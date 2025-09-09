class SQLFormatter {
    constructor(options = {}) {
        this.parser = new SQLParser();
        this.fieldFormatter = new FieldFormatter({
            maxCharsPerLine: options.maxCharsPerLine || 32000,
            excelMaxChars: options.excelMaxChars || 32767,
            indentSize: options.indentSize || 4
        });
        this.queryBuilder = new QueryBuilder({
            indentSize: options.indentSize || 4,
            preserveFormatting: options.preserveFormatting !== false,
            addBlankLines: options.addBlankLines !== false
        });

        // Configuración
        this.maxCharsPerLine = options.maxCharsPerLine || 32000;
        this.excelMaxChars = options.excelMaxChars || 32767;
        this.indentSize = options.indentSize || 4;
    }

    /**
     * Actualiza la configuración del formateador
     */
    updateSettings(settings) {
        if (settings.maxCharsPerLine) this.maxCharsPerLine = settings.maxCharsPerLine;
        if (settings.excelMaxChars) this.excelMaxChars = settings.excelMaxChars;
        if (settings.indentSize) this.indentSize = settings.indentSize;

        // Actualizar en los módulos
        this.fieldFormatter.updateSettings(settings);
        this.queryBuilder.updateSettings(settings);
    }

    /**
     * Formatea una consulta SQL completa - SOLO FORMATEAR CAMPOS, preservar esqueleto
     */
    formatSQL(query, isForExcel = false) {
        try {
            // Validar entrada
            if (!query || typeof query !== 'string') {
                throw new Error('La consulta debe ser una cadena de texto válida');
            }

            const trimmedQuery = query.trim();
            if (!trimmedQuery) {
                throw new Error('La consulta no puede estar vacía');
            }

            // NUEVO ENFOQUE: Solo formatear campos en SELECT, preservar todo lo demás
            const formattedQuery = this.formatOnlySelectFields(trimmedQuery, isForExcel);

            // Calcular estadísticas básicas
            const stats = this.calculateBasicStats(trimmedQuery, formattedQuery, isForExcel);

            return {
                success: true,
                query: formattedQuery,
                stats: stats
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                details: error.stack // Para debugging en desarrollo
            };
        }
    }

    /**
     * Formatea SOLO los campos dentro de SELECT, preservando el resto de la estructura
     */
    formatOnlySelectFields(query, isForExcel = false) {
        let formattedQuery = query;
        
        // Buscar todos los bloques SELECT y reemplazar solo sus campos
        const selectBlocks = this.findSelectFieldBlocks(query);
        
        // Procesar cada bloque de campos de SELECT
        for (const block of selectBlocks) {
            const fields = this.parser.extractFields(block.fieldsContent);
            
            // Determinar si necesita formateo
            if (this.shouldFormatFields(fields, block.fieldsContent)) {
                const formattedFields = this.fieldFormatter.formatFields(fields, isForExcel);
                
                // Construir el reemplazo apropiado según el tipo de bloque
                let newSelectBlock;
                if (block.type === 'subquery') {
                    // Para subconsultas, mantener el paréntesis
                    newSelectBlock = '(\n  SELECT\n' + this.addExtraIndent(formattedFields, '  ');
                } else {
                    // Para SELECT principales
                    newSelectBlock = 'SELECT\n' + formattedFields;
                }
                
                formattedQuery = formattedQuery.replace(block.fullMatch, newSelectBlock);
            }
        }
        
        return formattedQuery;
    }

    /**
     * Encuentra bloques de campos en SELECT sin alterar el resto de la estructura
     * Mejorado para manejar MINUS, UNION ALL y subconsultas anidadas
     */
    findSelectFieldBlocks(query) {
        const blocks = [];
        
        // Regex principal para capturar SELECT hasta la siguiente palabra clave
        // Maneja: SELECT ... FROM, SELECT ... UNION, SELECT ... MINUS, SELECT ... )
        const mainRegex = /SELECT\s+((?:(?!SELECT|FROM|UNION|MINUS|WHERE|GROUP|ORDER|HAVING|LIMIT)\S|\s)*?)(?=\s+(?:FROM|UNION|MINUS|\)|WHERE|GROUP|ORDER|HAVING|LIMIT|$))/gi;
        let match;

        while ((match = mainRegex.exec(query)) !== null) {
            const fieldsContent = match[1].trim();
            
            // Verificar que tiene contenido válido y no es solo espacios o comentarios
            if (fieldsContent && this.isValidFieldContent(fieldsContent)) {
                blocks.push({
                    fullMatch: match[0],
                    fieldsContent: fieldsContent,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length,
                    type: 'main'
                });
            }
        }

        // Buscar SELECT dentro de paréntesis (subconsultas)
        const subqueryRegex = /\(\s*SELECT\s+((?:(?!SELECT|FROM|\)).)*?)(?=\s+FROM|\))/gi;
        while ((match = subqueryRegex.exec(query)) !== null) {
            const fieldsContent = match[1].trim();
            
            if (fieldsContent && this.isValidFieldContent(fieldsContent)) {
                // Encontrar el SELECT completo incluyendo el paréntesis
                const fullSelectMatch = query.substring(match.index).match(/\(\s*SELECT\s+[^)]*FROM/i);
                if (fullSelectMatch) {
                    blocks.push({
                        fullMatch: fullSelectMatch[0],
                        fieldsContent: fieldsContent,
                        startIndex: match.index,
                        type: 'subquery'
                    });
                }
            }
        }

        // Ordenar bloques por posición para procesarlos correctamente
        return blocks.sort((a, b) => a.startIndex - b.startIndex);
    }

    /**
     * Valida que el contenido sea realmente campos y no otra cosa
     */
    isValidFieldContent(content) {
        const upper = content.toUpperCase().trim();
        
        // No debe ser solo asterisco
        if (upper === '*') return false;
        
        // No debe contener palabras clave principales sueltas
        const invalidKeywords = ['FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION', 'MINUS'];
        for (const keyword of invalidKeywords) {
            if (upper === keyword || upper.startsWith(keyword + ' ')) {
                return false;
            }
        }
        
        // Debe tener algo parecido a campos (nombres, comas, funciones)
        return /[a-zA-Z_]/.test(content) && (content.includes(',') || content.includes('(') || content.split('\n').length > 1);
    }

    /**
     * Determina si un bloque de campos necesita formateo horizontal
     */
    shouldFormatFields(fields, originalContent) {
        // Si tiene pocos campos simples, no formatear
        if (fields.length <= 4 && originalContent.length < 200) {
            return false;
        }
        
        // Si los campos ya están en una línea y caben bien, no formatear
        if (originalContent.split('\n').length <= 2 && originalContent.length < 500) {
            return false;
        }
        
        // Si tiene muchos campos o es muy largo, sí formatear
        return fields.length > 4 || originalContent.length > 300;
    }

    /**
     * Agrega indentación extra a un texto formateado
     */
    addExtraIndent(text, extraIndent) {
        return text.split('\n').map(line => {
            if (line.trim()) {
                return extraIndent + line;
            }
            return line;
        }).join('\n');
    }

    /**
     * Calcular estadísticas básicas para el nuevo enfoque
     */
    calculateBasicStats(originalQuery, formattedQuery, isForExcel) {
        const originalLines = originalQuery.split('\n').length;
        const formattedLines = formattedQuery.split('\n').length;
        
        // Contar campos aproximadamente
        const fieldCount = (formattedQuery.match(/\w+\s*\(/g) || []).length + 
                          (formattedQuery.match(/,\s*\w+/g) || []).length;
        
        const reduction = originalLines > 0 
            ? Math.round(((originalLines - formattedLines) / originalLines) * 100) 
            : 0;

        return {
            fieldCount: fieldCount,
            lineCount: formattedLines,
            charCount: formattedQuery.length,
            reductionPercent: Math.max(0, reduction),
            originalLines: originalLines,
            maxCharsUsed: isForExcel ? this.excelMaxChars : this.maxCharsPerLine,
            isExcelOptimized: isForExcel,
            compressionRatio: originalLines > 0 ? Math.round((formattedLines / originalLines) * 100) : 100
        };
    }

    /**
     * Formatea los campos de las cláusulas que los contienen
     */
    formatClauseFields(clauses, isForExcel = false) {
        const formattedFields = {};

        clauses.forEach(clause => {
            if (clause.isFieldContainer && clause.content) {
                try {
                    const fields = this.parser.extractFields(clause.content);
                    if (fields.length > 0) {
                        const formatted = this.fieldFormatter.formatFields(fields, isForExcel);
                        formattedFields[clause.type] = formatted;
                    }
                } catch (error) {
                    console.warn(`Error formateando campos de ${clause.type}:`, error.message);
                    // En caso de error, usar contenido original
                    formattedFields[clause.type] = clause.content;
                }
            }
        });

        return formattedFields;
    }

    /**
     * Calcula estadísticas comprehensivas del formateo
     */
    calculateComprehensiveStats(parseResult, formattedQuery, formattedFields, isForExcel) {
        const originalLines = parseResult.original.split('\n').length;
        const formattedLines = formattedQuery.split('\n').filter(line => line.trim()).length;
        
        // Contar campos totales
        let totalFields = 0;
        parseResult.clauses.forEach(clause => {
            if (clause.isFieldContainer && clause.content) {
                const fields = this.parser.extractFields(clause.content);
                totalFields += fields.length;
            }
        });

        // Estadísticas de reducción
        const lineReduction = originalLines > 0 
            ? Math.round(((originalLines - formattedLines) / originalLines) * 100) 
            : 0;

        // Estadísticas por cláusula
        const clauseStats = {};
        Object.keys(formattedFields).forEach(clauseType => {
            const fieldLines = formattedFields[clauseType].split('\n').length;
            const originalFieldCount = parseResult.clauses
                .find(c => c.type === clauseType && c.isFieldContainer)?.content 
                ? this.parser.extractFields(
                    parseResult.clauses.find(c => c.type === clauseType).content
                  ).length 
                : 0;
            
            clauseStats[clauseType] = {
                originalFields: originalFieldCount,
                formattedLines: fieldLines,
                fieldsPerLine: fieldLines > 0 ? Math.round(originalFieldCount / fieldLines * 10) / 10 : 0
            };
        });

        return {
            // Estadísticas básicas
            fieldCount: totalFields,
            lineCount: formattedLines,
            charCount: formattedQuery.length,
            reductionPercent: Math.max(0, lineReduction),
            
            // Estadísticas detalladas
            originalLines: originalLines,
            clauseCount: parseResult.clauses.length,
            hasSubqueries: parseResult.hasSubqueries,
            clauseBreakdown: clauseStats,
            
            // Configuración usada
            maxCharsUsed: isForExcel ? this.excelMaxChars : this.maxCharsPerLine,
            isExcelOptimized: isForExcel,
            
            // Métricas de eficiencia
            compressionRatio: originalLines > 0 ? Math.round((formattedLines / originalLines) * 100) : 100,
            averageLineLength: formattedLines > 0 ? Math.round(formattedQuery.length / formattedLines) : 0
        };
    }

    /**
     * Prepara datos para exportación a Excel
     */
    prepareForExcel(query) {
        const result = this.formatSQL(query, true);
        if (!result.success) return result;

        try {
            const lines = result.query.split('\n');
            const excelData = [];
            
            lines.forEach(line => {
                if (line.trim()) {
                    if (line.length > this.excelMaxChars) {
                        // Dividir líneas que excedan el límite
                        const chunks = this.fieldFormatter.splitLineForExcel(line);
                        chunks.forEach(chunk => {
                            excelData.push([chunk]);
                        });
                    } else {
                        excelData.push([line]);
                    }
                }
            });

            return {
                success: true,
                data: excelData,
                stats: result.stats,
                rowCount: excelData.length
            };

        } catch (error) {
            return {
                success: false,
                error: 'Error preparando datos para Excel: ' + error.message
            };
        }
    }

    /**
     * Optimiza automáticamente el formateo para obtener mejores resultados
     */
    optimizeFormatting(query, targetReduction = 80) {
        try {
            // Probar diferentes configuraciones
            const configurations = [
                { maxCharsPerLine: Math.floor(this.maxCharsPerLine * 0.8) },
                { maxCharsPerLine: this.maxCharsPerLine },
                { maxCharsPerLine: Math.floor(this.maxCharsPerLine * 1.2) },
                { maxCharsPerLine: Math.floor(this.maxCharsPerLine * 1.5) }
            ];

            let bestResult = null;
            let bestScore = -1;
            const originalSettings = {
                maxCharsPerLine: this.maxCharsPerLine,
                excelMaxChars: this.excelMaxChars,
                indentSize: this.indentSize
            };

            for (const config of configurations) {
                // Aplicar configuración temporal
                this.updateSettings(config);
                
                // Formatear con esta configuración
                const result = this.formatSQL(query);
                
                if (result.success) {
                    // Calcular puntuación
                    const reductionScore = Math.min(result.stats.reductionPercent / targetReduction, 1) * 60;
                    const readabilityScore = result.stats.averageLineLength > 0 
                        ? Math.min(100 / result.stats.averageLineLength, 1) * 40
                        : 0;
                    const totalScore = reductionScore + readabilityScore;

                    if (totalScore > bestScore) {
                        bestScore = totalScore;
                        bestResult = result;
                        bestResult.optimizationConfig = config;
                    }
                }
            }

            // Restaurar configuración original
            this.updateSettings(originalSettings);

            return bestResult || this.formatSQL(query);

        } catch (error) {
            return {
                success: false,
                error: 'Error en optimización automática: ' + error.message
            };
        }
    }

    /**
     * Valida una consulta antes de formatear
     */
    validateQuery(query) {
        const errors = [];
        const warnings = [];

        if (!query || typeof query !== 'string') {
            errors.push('La consulta debe ser una cadena de texto');
            return { isValid: false, errors, warnings };
        }

        const trimmed = query.trim();
        if (!trimmed) {
            errors.push('La consulta no puede estar vacía');
            return { isValid: false, errors, warnings };
        }

        // Verificaciones básicas de SQL
        if (!trimmed.toUpperCase().includes('SELECT')) {
            errors.push('La consulta debe contener al menos una cláusula SELECT');
        }

        // Verificar paréntesis balanceados
        let parentheses = 0;
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < trimmed.length; i++) {
            const char = trimmed[i];
            const prevChar = i > 0 ? trimmed[i - 1] : '';

            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inQuotes) {
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar) {
                    inQuotes = false;
                    quoteChar = '';
                }
            }

            if (!inQuotes) {
                if (char === '(') parentheses++;
                else if (char === ')') parentheses--;
            }
        }

        if (parentheses !== 0) {
            errors.push('Paréntesis no balanceados en la consulta');
        }

        // Advertencias
        if (trimmed.length > 50000) {
            warnings.push('La consulta es muy larga, el procesamiento puede ser lento');
        }

        if ((trimmed.match(/SELECT/gi) || []).length > 10) {
            warnings.push('La consulta tiene muchas subconsultas, el formateo puede ser complejo');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Obtiene información de diagnóstico del formateador
     */
    getDiagnosticInfo() {
        return {
            version: '2.0.0',
            modules: {
                parser: this.parser.constructor.name,
                fieldFormatter: this.fieldFormatter.constructor.name,
                queryBuilder: this.queryBuilder.constructor.name
            },
            configuration: {
                maxCharsPerLine: this.maxCharsPerLine,
                excelMaxChars: this.excelMaxChars,
                indentSize: this.indentSize
            },
            capabilities: [
                'Formateo horizontal de campos',
                'Preservación de palabras clave SQL',
                'Optimización para Excel',
                'Validación de consultas',
                'Estadísticas detalladas',
                'Optimización automática'
            ]
        };
    }
}