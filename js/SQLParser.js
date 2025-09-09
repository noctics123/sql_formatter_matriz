class SQLParser {
    constructor() {
        this.keywords = [
            'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 
            'ORDER BY', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL', 'INTERSECT', 
            'EXCEPT', 'MINUS', 'MINUS ALL', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 
            'CREATE', 'ALTER', 'DROP', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 
            'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'USING', 
            'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 
            'IN', 'EXISTS', 'BETWEEN', 'FILTER'
        ];
    }

    /**
     * Limpia la consulta removiendo comentarios y normalizando espacios
     */
    cleanQuery(query) {
        // Remover comentarios de línea
        query = query.replace(/--.*$/gm, '');
        
        // Remover comentarios de bloque
        query = query.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Normalizar espacios múltiples pero preservar saltos de línea importantes
        query = query.replace(/[ \t]+/g, ' ');
        query = query.replace(/\n\s*\n/g, '\n');
        
        return query.trim();
    }

    /**
     * Parsea una consulta SQL en cláusulas estructuradas
     */
    parseQuery(query) {
        const cleanQuery = this.cleanQuery(query);
        const clauses = this.extractClausesAdvanced(cleanQuery);
        
        return {
            original: query,
            cleaned: cleanQuery,
            clauses: clauses,
            hasSubqueries: this.hasSubqueries(cleanQuery)
        };
    }

    /**
     * Método mejorado para extraer cláusulas manejando consultas anidadas
     */
    extractClausesAdvanced(query) {
        const clauses = [];
        const segments = this.splitByMainKeywords(query);
        
        segments.forEach(segment => {
            if (segment.keyword && segment.content !== undefined) {
                clauses.push({
                    type: segment.keyword,
                    content: segment.content.trim(),
                    isFieldContainer: this.isFieldContainerClause(segment.keyword),
                    level: segment.level || 0
                });
            }
        });
        
        return clauses;
    }

    /**
     * Divide la consulta por palabras clave principales manteniendo jerarquía
     */
    splitByMainKeywords(query) {
        const segments = [];
        const tokens = this.advancedTokenize(query);
        let currentSegment = null;
        let parenthesesLevel = 0;
        let i = 0;

        while (i < tokens.length) {
            const token = tokens[i];
            const upperToken = token.value.toUpperCase();

            // Manejar paréntesis
            if (token.type === 'parenthesis') {
                if (token.value === '(') {
                    parenthesesLevel++;
                } else if (token.value === ')') {
                    parenthesesLevel--;
                }
            }

            // Detectar palabra clave principal en el nivel correcto
            if (token.type === 'keyword' && parenthesesLevel === 0) {
                const keywordInfo = this.detectComplexKeyword(tokens, i);
                
                if (keywordInfo.isMainKeyword) {
                    // Finalizar segmento anterior
                    if (currentSegment) {
                        segments.push(currentSegment);
                    }

                    // Iniciar nuevo segmento
                    currentSegment = {
                        keyword: keywordInfo.fullKeyword,
                        content: '',
                        level: parenthesesLevel,
                        startIndex: i
                    };

                    // Saltar tokens de la palabra clave compleja
                    i += keywordInfo.tokenCount - 1;
                } else if (currentSegment) {
                    // Agregar al contenido del segmento actual
                    currentSegment.content += (currentSegment.content ? ' ' : '') + token.value;
                }
            } else if (currentSegment) {
                // Agregar al contenido del segmento actual
                currentSegment.content += (currentSegment.content ? ' ' : '') + token.value;
            }

            i++;
        }

        // Agregar último segmento
        if (currentSegment) {
            segments.push(currentSegment);
        }

        return segments;
    }

    /**
     * Tokenizador avanzado que clasifica tipos de tokens
     */
    advancedTokenize(query) {
        const tokens = [];
        const regex = /([a-zA-Z_]\w*|\d+(?:\.\d+)?|'[^']*'|"[^"]*"|[(),;.]|\S)/g;
        let match;

        while ((match = regex.exec(query)) !== null) {
            const value = match[1];
            let type = 'word';

            if (['(', ')'].includes(value)) {
                type = 'parenthesis';
            } else if ([',', ';', '.'].includes(value)) {
                type = 'punctuation';
            } else if (this.keywords.includes(value.toUpperCase())) {
                type = 'keyword';
            } else if (/^\d+(\.\d+)?$/.test(value)) {
                type = 'number';
            } else if (/^['"].*['"]$/.test(value)) {
                type = 'string';
            }

            tokens.push({ value, type, index: match.index });
        }

        return tokens;
    }

    /**
     * Detecta palabras clave complejas (UNION ALL, MINUS ALL, etc.)
     */
    detectComplexKeyword(tokens, startIndex) {
        if (startIndex >= tokens.length) return { isMainKeyword: false, tokenCount: 0 };

        const token = tokens[startIndex];
        const nextToken = startIndex + 1 < tokens.length ? tokens[startIndex + 1] : null;
        const upperToken = token.value.toUpperCase();

        // Palabras clave principales de una sola palabra
        const singleKeywords = ['SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'WITH', 'FILTER'];
        if (singleKeywords.includes(upperToken)) {
            return { 
                isMainKeyword: true, 
                fullKeyword: upperToken, 
                tokenCount: 1 
            };
        }

        // Palabras clave complejas
        const complexKeywords = {
            'GROUP': ['BY'],
            'ORDER': ['BY'],
            'UNION': ['ALL'],
            'MINUS': ['ALL']
        };

        if (complexKeywords[upperToken] && nextToken) {
            const expectedNext = complexKeywords[upperToken][0];
            if (nextToken.value.toUpperCase() === expectedNext) {
                return { 
                    isMainKeyword: true, 
                    fullKeyword: upperToken + ' ' + expectedNext, 
                    tokenCount: 2 
                };
            }
        }

        // UNION sin ALL
        if (upperToken === 'UNION' && (!nextToken || nextToken.value.toUpperCase() !== 'ALL')) {
            return { 
                isMainKeyword: true, 
                fullKeyword: 'UNION', 
                tokenCount: 1 
            };
        }

        // MINUS sin ALL  
        if (upperToken === 'MINUS' && (!nextToken || nextToken.value.toUpperCase() !== 'ALL')) {
            return { 
                isMainKeyword: true, 
                fullKeyword: 'MINUS', 
                tokenCount: 1 
            };
        }

        return { isMainKeyword: false, tokenCount: 0 };
    }

    /**
     * Extrae las cláusulas principales de la consulta (método original para compatibilidad)
     */
    extractClauses(query) {
        const clauses = [];
        const tokens = this.tokenize(query);
        let currentClause = null;
        let currentContent = '';
        let parenthesesLevel = 0;
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const upperToken = token.toUpperCase();

            // Manejo de comillas
            if ((token === '"' || token === "'") && !this.isEscaped(tokens, i)) {
                if (!inQuotes) {
                    inQuotes = true;
                    quoteChar = token;
                } else if (token === quoteChar) {
                    inQuotes = false;
                    quoteChar = '';
                }
            }

            // Manejo de paréntesis
            if (!inQuotes) {
                if (token === '(') {
                    parenthesesLevel++;
                } else if (token === ')') {
                    parenthesesLevel--;
                }
            }

            // Detectar nueva cláusula principal (solo si estamos en nivel 0 de paréntesis)
            if (!inQuotes && parenthesesLevel === 0 && this.isMainClause(upperToken, tokens, i)) {
                // Guardar cláusula anterior si existe
                if (currentClause && currentContent.trim()) {
                    clauses.push({
                        type: currentClause,
                        content: currentContent.trim(),
                        isFieldContainer: this.isFieldContainerClause(currentClause)
                    });
                }

                // Iniciar nueva cláusula
                currentClause = this.getClauseType(upperToken, tokens, i);
                currentContent = '';
                
                // Agregar tokens de la cláusula (ej: "GROUP BY" en lugar de solo "GROUP")
                const clauseTokens = this.getClauseTokens(tokens, i);
                i += clauseTokens.length - 1; // Avanzar el índice
                continue;
            }

            // Acumular contenido de la cláusula actual
            if (currentClause) {
                currentContent += (currentContent ? ' ' : '') + token;
            } else if (!currentClause && upperToken === 'SELECT') {
                // Caso especial: comenzar con SELECT
                currentClause = 'SELECT';
                currentContent = '';
            }
        }

        // Agregar la última cláusula
        if (currentClause && currentContent.trim()) {
            clauses.push({
                type: currentClause,
                content: currentContent.trim(),
                isFieldContainer: this.isFieldContainerClause(currentClause)
            });
        }

        return clauses;
    }

    /**
     * Tokeniza la consulta en palabras y símbolos
     */
    tokenize(query) {
        // Expresión regular que captura palabras, números, símbolos y espacios
        const regex = /([a-zA-Z_]\w*|\d+(?:\.\d+)?|'[^']*'|"[^"]*"|[(),;.]|\S)/g;
        const tokens = [];
        let match;

        while ((match = regex.exec(query)) !== null) {
            tokens.push(match[1]);
        }

        return tokens;
    }

    /**
     * Verifica si un token está escapado
     */
    isEscaped(tokens, index) {
        return index > 0 && tokens[index - 1] === '\\';
    }

    /**
     * Determina si un token es el inicio de una cláusula principal
     */
    isMainClause(token, tokens, index) {
        const mainClauses = [
            'SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 
            'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'WITH'
        ];

        if (mainClauses.includes(token)) {
            // Casos especiales para cláusulas de múltiples palabras
            if (token === 'GROUP' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'BY') {
                return true;
            }
            if (token === 'ORDER' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'BY') {
                return true;
            }
            if (token === 'UNION' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'ALL') {
                return true;
            }
            if (['SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'INTERSECT', 'EXCEPT', 'WITH'].includes(token)) {
                return true;
            }
            if (token === 'UNION' && (!tokens[index + 1] || tokens[index + 1].toUpperCase() !== 'ALL')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Obtiene el tipo de cláusula basado en el token
     */
    getClauseType(token, tokens, index) {
        if (token === 'GROUP' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'BY') {
            return 'GROUP BY';
        }
        if (token === 'ORDER' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'BY') {
            return 'ORDER BY';
        }
        if (token === 'UNION' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'ALL') {
            return 'UNION ALL';
        }
        return token;
    }

    /**
     * Obtiene todos los tokens que forman una cláusula (ej: ["GROUP", "BY"])
     */
    getClauseTokens(tokens, index) {
        const token = tokens[index].toUpperCase();
        
        if (token === 'GROUP' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'BY') {
            return ['GROUP', 'BY'];
        }
        if (token === 'ORDER' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'BY') {
            return ['ORDER', 'BY'];
        }
        if (token === 'UNION' && tokens[index + 1] && tokens[index + 1].toUpperCase() === 'ALL') {
            return ['UNION', 'ALL'];
        }
        
        return [tokens[index]];
    }

    /**
     * Determina si una cláusula puede contener campos que necesiten formateo horizontal
     */
    isFieldContainerClause(clauseType) {
        return ['SELECT', 'GROUP BY', 'ORDER BY'].includes(clauseType);
    }

    /**
     * Detecta si la consulta tiene subconsultas
     */
    hasSubqueries(query) {
        let parenthesesLevel = 0;
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            const prevChar = i > 0 ? query[i - 1] : '';

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
                    // Verificar si hay SELECT después del paréntesis
                    const remaining = query.substring(i + 1).trim().toUpperCase();
                    if (remaining.startsWith('SELECT')) {
                        return true;
                    }
                } else if (char === ')') {
                    parenthesesLevel--;
                }
            }
        }

        return false;
    }

    /**
     * Extrae campos de una cláusula que los contenga
     */
    extractFields(content) {
        const fields = [];
        let currentField = '';
        let parenthesesCount = 0;
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < content.length; i++) {
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
                    parenthesesCount++;
                } else if (char === ')') {
                    parenthesesCount--;
                } else if (char === ',' && parenthesesCount === 0) {
                    // Fin del campo actual
                    if (currentField.trim()) {
                        fields.push(currentField.trim());
                    }
                    currentField = '';
                    continue;
                }
            }

            currentField += char;
        }

        // Agregar el último campo
        if (currentField.trim()) {
            fields.push(currentField.trim());
        }

        return fields;
    }
}