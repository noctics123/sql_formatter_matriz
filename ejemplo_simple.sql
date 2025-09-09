-- EJEMPLO SIMPLE PARA DEMOSTRAR EL NUEVO ENFOQUE
select * from (
    select 
        'EDV' as capa, 
        codmes,
        count(codclaveunicocli) as codclaveunicocli_count,
        count(codclavepartycli) as codclavepartycli_count,
        count(codinternocomputacional) as codinternocomputacional_count,
        count(codmesanalisis) as codmesanalisis_count,
        sum(monto_total) as monto_total_sum,
        avg(score_riesgo) as score_riesgo_avg
    from tabla_edv
    where codmes = '202409'
    group by codmes
    
    union all
    
    select 
        'DDV' as capa, 
        codmes,
        count(codclaveunicocli) as codclaveunicocli_count,
        count(codclavepartycli) as codclavepartycli_count,
        count(codinternocomputacional) as codinternocomputacional_count,
        count(codmesanalisis) as codmesanalisis_count,
        sum(monto_total) as monto_total_sum,
        avg(score_riesgo) as score_riesgo_avg
    from tabla_ddv
    where codmes = '202409'
    group by codmes
) order by capa;