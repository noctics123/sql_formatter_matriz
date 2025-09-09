SELECT
  'EDV' AS capa, codmes, x, y
FROM catalog_lhcl_prod_bcp_expl.bcp_edv_trdata_012.hm_matriztransaccioncanalpagotransferencia_ruben
WHERE codmes IN (202506, 202507, 202508)

MINUS ALL

SELECT
  'DDV' AS capa, codmes, x, y
FROM catalog_lhcl_prod_bcp_expl.bcp_ddv_trdata_012.hm_matriztransaccioncanalpagotransferencia_ruben
WHERE codmes IN (202506, 202507, 202508);