class QueryBuilder {
    constructor(options = {}) {
        this.indentSize = options.indentSize || 4;
        this.preserveFormatting = options.preserveFormatting !== false;
        this.addBlankLines = options.addBlankLines !== false;
    }

    /**
     * Actualiza la configuración del builder
     */
    updateSettings(settings) {
        if (settings.indentSize) this.indentSize = settings.indentSize;
        if (settings.preserveFormatting !== undefined) this.preserveFormatting = settings.preserveFormatting;
        if (settings.addBlankLines !== undefined) this.addBlankLines = settings.addBlankLines;
    }

    /**
     * Construye la consulta final a partir de cláusulas procesadas
     */
    buildQuery(clauses, formattedFields = {}) {
        if (!clauses || clauses.length === 0) {
            return '';
        }

        const lines = [];
        let previousClauseType = null;

        clauses.forEach((clause, index) => {
            // Agregar línea en blanco entre cláusulas principales para legibilidad
            if (this.addBlankLines && index > 0 && this.shouldAddBlankLine(previousClauseType, clause.type)) {
                lines.push('');
            }

            // Construir la línea de la cláusula
            const clauseLine = this.buildClauseLine(clause, formattedFields);
            lines.push(...clauseLine);

            previousClauseType = clause.type;
        });

        return lines.join('\n');
    }

    /**
     * Construye las líneas para una cláusula específica
     */
    buildClauseLine(clause, formattedFields) {
        const lines = [];
        const clauseKeyword = clause.type;

        if (clause.isFieldContainer && formattedFields[clause.type]) {
            // Cláusula con campos formateados (SELECT, GROUP BY, ORDER BY)
            lines.push(clauseKeyword);
            
            // Agregar campos formateados
            const fieldLines = formattedFields[clause.type].split('\n');
            lines.push(...fieldLines);
        } else {
            // Cláusula regular (FROM, WHERE, etc.)
            const content = clause.content.trim();
            
            if (content) {
                if (this.isSimpleClause(clause.type, content)) {
                    // Cláusula simple en una línea
                    lines.push(`${clauseKeyword} ${content}`);
                } else {
                    // Cláusula compleja en múltiples líneas
                    lines.push(clauseKeyword);
                    lines.push(...this.formatComplexClause(content));
                }
            } else {
                // Solo la palabra clave (útil para debugging)
                lines.push(clauseKeyword);
            }
        }

        return lines;
    }

    /**
     * Determina si debe agregarse una línea en blanco entre cláusulas
     */
    shouldAddBlankLine(previousType, currentType) {
        // Agregar línea en blanco antes de cláusulas principales
        const majorClauses = [
            'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 
            'UNION', 'UNION ALL', 'MINUS', 'MINUS ALL', 'INTERSECT', 'EXCEPT',
            'WITH', 'FILTER'
        ];
        
        return majorClauses.includes(currentType) && 
               previousType !== null && 
               previousType !== currentType;
    }

    /**
     * Determina si una cláusula es simple (puede ir en una línea)
     */
    isSimpleClause(clauseType, content) {
        // Cláusulas que típicamente son simples
        const simpleClauseTypes = ['FROM', 'LIMIT', 'OFFSET'];
        
        if (simpleClauseTypes.includes(clauseType)) {
            return true;
        }

        // WHERE, HAVING, FILTER pueden ser simples si son cortos
        if (['WHERE', 'HAVING', 'FILTER'].includes(clauseType)) {
            return content.length <= 100 && 
                   !content.includes('(') && 
                   !content.includes(' AND ') && 
                   !content.includes(' OR ');
        }

        // UNION, MINUS generalmente van en una línea si no tienen subconsultas complejas
        if (['UNION', 'UNION ALL', 'MINUS', 'MINUS ALL'].includes(clauseType)) {
            // Si el contenido es muy corto o está vacío, mantenerlo simple
            return content.length <= 50;
        }

        return false;
    }

    /**
     * Formatea cláusulas complejas con indentación apropiada
     */
    formatComplexClause(content) {
        const lines = [];
        const indent = ' '.repeat(this.indentSize);
        
        // Para cláusulas WHERE y HAVING complejas, dividir por AND/OR
        if (content.includes(' AND ') || content.includes(' OR ')) {
            lines.push(...this.formatConditionalClause(content, indent));
        } else {
            // Para otras cláusulas complejas, simplemente indentar
            lines.push(indent + content);
        }

        return lines;
    }

    /**
     * Formatea cláusulas condicionales (WHERE, HAVING) con AND/OR
     */
    formatConditionalClause(content, indent) {
        const lines = [];
        const conditions = this.splitByLogicalOperators(content);
        
        conditions.forEach((condition, index) => {
            if (index === 0) {
                lines.push(indent + condition.content.trim());
            } else {
                lines.push(indent + condition.operator + ' ' + condition.content.trim());
            }
        });

        return lines;
    }

    /**
     * Divide el contenido por operadores lógicos (AND, OR)
     */
    splitByLogicalOperators(content) {
        const conditions = [];
        let currentCondition = '';
        let parenthesesLevel = 0;
        let inQuotes = false;
        let quoteChar = '';
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            const prevChar = i > 0 ? content[i - 1] : '';

            // Manejo de comillas
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
                if (char === '(') {
                    parenthesesLevel++;
                } else if (char === ')') {
                    parenthesesLevel--;
                }

                // Buscar operadores lógicos en nivel 0 de paréntesis
                if (parenthesesLevel === 0) {
                    const remaining = content.substring(i).toUpperCase();
                    
                    if (remaining.startsWith(' AND ')) {
                        conditions.push({
                            operator: conditions.length === 0 ? '' : 'AND',
                            content: currentCondition
                        });
                        currentCondition = '';
                        i += 5; // Saltar ' AND '
                        continue;
                    } else if (remaining.startsWith(' OR ')) {
                        conditions.push({
                            operator: conditions.length === 0 ? '' : 'OR',
                            content: currentCondition
                        });
                        currentCondition = '';
                        i += 4; // Saltar ' OR '
                        continue;
                    }
                }
            }

            currentCondition += char;
            i++;
        }

        // Agregar la última condición
        if (currentCondition.trim()) {
            conditions.push({
                operator: conditions.length === 0 ? '' : 'AND', // Por defecto AND si no se especifica
                content: currentCondition
            });
        }

        return conditions;
    }

    /**
     * Construye una consulta con subconsultas
     */
    buildQueryWithSubqueries(mainClauses, subqueries, formattedFields) {
        // Por ahora, manejar subconsultas de forma básica
        // En una versión futura se podría implementar formateo recursivo
        return this.buildQuery(mainClauses, formattedFields);
    }

    /**
     * Valida la estructura de cláusulas antes de construir
     */
    validateClauses(clauses) {
        const errors = [];
        const requiredOrder = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT'];
        let lastValidIndex = -1;

        if (!clauses || !Array.isArray(clauses)) {
            errors.push('Las cláusulas deben ser un array válido');
            return { isValid: false, errors };
        }

        clauses.forEach((clause, index) => {
            // Verificar estructura básica
            if (!clause.type || typeof clause.type !== 'string') {
                errors.push(`Cláusula ${index + 1}: falta el tipo o es inválido`);
                return;
            }

            // Verificar orden lógico de SQL
            const currentIndex = requiredOrder.indexOf(clause.type);
            if (currentIndex !== -1 && currentIndex < lastValidIndex) {
                errors.push(`Cláusula ${clause.type}: está fuera de orden en la consulta SQL`);
            }
            if (currentIndex !== -1) {
                lastValidIndex = currentIndex;
            }
        });

        // Verificar que haya al menos SELECT
        const hasSelect = clauses.some(clause => clause.type === 'SELECT');
        if (!hasSelect) {
            errors.push('La consulta debe contener al menos una cláusula SELECT');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Genera estadísticas de la consulta construida
     */
    generateStats(originalQuery, builtQuery, clauses) {
        const originalLines = originalQuery.split('\n').length;
        const builtLines = builtQuery.split('\n').filter(line => line.trim()).length;
        
        const clauseStats = {};
        clauses.forEach(clause => {
            clauseStats[clause.type] = clauseStats[clause.type] || 0;
            clauseStats[clause.type]++;
        });

        return {
            originalLines,
            builtLines,
            totalClauses: clauses.length,
            clauseBreakdown: clauseStats,
            compressionRatio: originalLines > 0 ? Math.round((builtLines / originalLines) * 100) : 100,
            totalCharacters: builtQuery.length
        };
    }
}