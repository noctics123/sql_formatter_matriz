SELECT
  *
FROM (
  SELECT
    'EDV' AS capa, codmes, SUM(can_tkt_tmo_tot_pag_bcp_u1m) AS can_tkt_tmo_tot_pag_bcp_u1m,    SUM(campo2) AS campo2_sum,    SUM(campo3) AS campo3_sum,    COUNT(campo4) AS campo4_count
  FROM catalog_lhcl_prod_bcp_expl.bcp_edv_trdata_012.hm_matriztransaccioncanalpagotransferencia_ruben
  WHERE codmes IN (202506, 202507, 202508)
  GROUP BY codmes
)

UNION ALL

SELECT
  'DDV' AS capa, codmes, SUM(can_tkt_tmo_tot_pag_bcp_u1m) AS can_tkt_tmo_tot_pag_bcp_u1m,    SUM(campo2) AS campo2_sum,    SUM(campo3) AS campo3_sum,    COUNT(campo4) AS campo4_count
FROM catalog_lhcl_prod_bcp_expl.bcp_ddv_...
GROUP BY codmes;