-- QUERY DE PRUEBA 1: Consulta básica con campos y agregaciones
SELECT 
    campo1,
    campo2,
    SUM(campo3) as total_suma,
    COUNT(*) as contador,
    AVG(campo4) as promedio,
    MAX(fecha_proceso) as ultima_fecha,
    MIN(fecha_proceso) as primera_fecha
FROM tabla_principal
WHERE estado = 'ACTIVO'
    AND fecha_proceso >= '2024-01-01'
GROUP BY campo1, campo2
HAVING COUNT(*) > 5
ORDER BY total_suma DESC;

-- QUERY DE PRUEBA 2: Con UNION ALL
SELECT 
    cliente_id,
    nombre_cliente,
    SUM(monto_transaccion) as total_transacciones,
    COUNT(numero_transaccion) as cantidad_transacciones,
    'TITULAR' as tipo_cliente
FROM transacciones_titulares
WHERE fecha_transaccion >= '2024-01-01'
GROUP BY cliente_id, nombre_cliente

UNION ALL

SELECT 
    beneficiario_id as cliente_id,
    nombre_beneficiario as nombre_cliente,
    SUM(monto_beneficio) as total_transacciones,
    COUNT(codigo_beneficio) as cantidad_transacciones,
    'BENEFICIARIO' as tipo_cliente
FROM beneficios_otorgados
WHERE fecha_otorgamiento >= '2024-01-01'
GROUP BY beneficiario_id, nombre_beneficiario;

-- QUERY DE PRUEBA 3: Con MINUS ALL y consultas anidadas
SELECT 
    cuenta_origen,
    cuenta_destino,
    SUM(monto) as total_enviado,
    COUNT(*) as total_operaciones,
    TO_CHAR(fecha_operacion, 'YYYY-MM') as mes_operacion
FROM operaciones_envio
WHERE tipo_operacion = 'TRANSFERENCIA'
    AND estado_operacion = 'COMPLETADA'

MINUS ALL

SELECT 
    cuenta_devolucion as cuenta_origen,
    cuenta_origen as cuenta_destino,
    SUM(monto_devuelto) as total_enviado,
    COUNT(*) as total_operaciones,
    TO_CHAR(fecha_devolucion, 'YYYY-MM') as mes_operacion
FROM devoluciones_proceso
WHERE motivo_devolucion = 'ERROR_TRANSFERENCIA';

-- QUERY DE PRUEBA 4: Consulta compleja con subconsultas y funciones ventana
SELECT 
    cliente.codigo_cliente,
    cliente.nombre_completo,
    cliente.tipo_documento,
    cliente.numero_documento,
    producto.codigo_producto,
    producto.descripcion_producto,
    SUM(movimiento.monto_movimiento) as total_movimientos,
    COUNT(movimiento.id_movimiento) as cantidad_movimientos,
    RANK() OVER (PARTITION BY producto.codigo_producto ORDER BY SUM(movimiento.monto_movimiento) DESC) as ranking_cliente,
    LAG(SUM(movimiento.monto_movimiento), 1) OVER (PARTITION BY cliente.codigo_cliente ORDER BY producto.codigo_producto) as monto_producto_anterior,
    (SELECT MAX(fecha_ultimo_acceso) FROM accesos_cliente ac WHERE ac.codigo_cliente = cliente.codigo_cliente) as ultimo_acceso,
    CASE 
        WHEN SUM(movimiento.monto_movimiento) > 100000 THEN 'ALTO_VOLUMEN'
        WHEN SUM(movimiento.monto_movimiento) > 50000 THEN 'MEDIO_VOLUMEN'
        ELSE 'BAJO_VOLUMEN'
    END as clasificacion_volumen
FROM cliente_maestro cliente
INNER JOIN producto_cliente pc ON cliente.codigo_cliente = pc.codigo_cliente
INNER JOIN producto_maestro producto ON pc.codigo_producto = producto.codigo_producto
INNER JOIN movimientos_cuenta movimiento ON pc.numero_cuenta = movimiento.numero_cuenta
WHERE cliente.estado_cliente = 'ACTIVO'
    AND producto.estado_producto = 'VIGENTE'
    AND movimiento.fecha_movimiento >= ADD_MONTHS(SYSDATE, -12)
    AND movimiento.tipo_movimiento IN ('DEBITO', 'CREDITO')
    AND cliente.segmento_cliente IN ('PREMIUM', 'GOLD', 'PLATINUM')
GROUP BY 
    cliente.codigo_cliente,
    cliente.nombre_completo,
    cliente.tipo_documento,
    cliente.numero_documento,
    producto.codigo_producto,
    producto.descripcion_producto
HAVING SUM(movimiento.monto_movimiento) > 1000
    AND COUNT(movimiento.id_movimiento) >= 5
ORDER BY total_movimientos DESC, cantidad_movimientos DESC
LIMIT 1000;

-- QUERY DE PRUEBA 5: Con FILTER y funciones analíticas
SELECT 
    sucursal.codigo_sucursal,
    sucursal.nombre_sucursal,
    sucursal.region_sucursal,
    empleado.codigo_empleado,
    empleado.nombre_empleado,
    COUNT(*) FILTER (WHERE venta.tipo_venta = 'PRODUCTO') as ventas_productos,
    COUNT(*) FILTER (WHERE venta.tipo_venta = 'SERVICIO') as ventas_servicios,
    SUM(venta.monto_venta) FILTER (WHERE EXTRACT(MONTH FROM venta.fecha_venta) = EXTRACT(MONTH FROM SYSDATE)) as ventas_mes_actual,
    SUM(venta.monto_venta) FILTER (WHERE EXTRACT(MONTH FROM venta.fecha_venta) = EXTRACT(MONTH FROM SYSDATE) - 1) as ventas_mes_anterior,
    ROUND(AVG(venta.monto_venta), 2) as promedio_venta,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY venta.monto_venta) as mediana_venta
FROM sucursal_maestro sucursal
LEFT JOIN empleado_sucursal es ON sucursal.codigo_sucursal = es.codigo_sucursal
LEFT JOIN empleado_maestro empleado ON es.codigo_empleado = empleado.codigo_empleado
LEFT JOIN ventas_realizadas venta ON empleado.codigo_empleado = venta.codigo_empleado
WHERE sucursal.estado_sucursal = 'OPERATIVA'
    AND empleado.estado_empleado = 'ACTIVO'
    AND venta.fecha_venta >= TRUNC(SYSDATE, 'YEAR')
GROUP BY 
    sucursal.codigo_sucursal,
    sucursal.nombre_sucursal,
    sucursal.region_sucursal,
    empleado.codigo_empleado,
    empleado.nombre_empleado
HAVING COUNT(*) >= 10
ORDER BY ventas_mes_actual DESC NULLS LAST;