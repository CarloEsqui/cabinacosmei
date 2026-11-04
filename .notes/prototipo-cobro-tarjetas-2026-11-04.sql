-- Prototipo del modelo A+C sobre la parte A del cobro v2 (anticipos, cancelación con ajuste, liga pago↔corte)
PRAGMA foreign_keys=ON;
CREATE TABLE cortes(id TEXT PRIMARY KEY, dia INT);
CREATE TABLE servicios(id TEXT PRIMARY KEY, precio REAL, total_productos REAL DEFAULT 0);
CREATE TABLE tarjetas(id TEXT PRIMARY KEY, codigo TEXT UNIQUE, tipo TEXT CHECK(tipo IN('venta','cortesia')), monto_inicial REAL, estatus TEXT DEFAULT 'activa');
CREATE TABLE descuentos(id TEXT PRIMARY KEY, servicio_id TEXT REFERENCES servicios, tipo TEXT CHECK(tipo IN('cupon','cortesia')), tarjeta_id TEXT, monto REAL, estatus TEXT DEFAULT 'aplicado');
CREATE TABLE pagos(id TEXT PRIMARY KEY, dia INT, servicio_id TEXT REFERENCES servicios, cita_id TEXT, tarjeta_id TEXT REFERENCES tarjetas,
  concepto TEXT CHECK(concepto IN('servicio','anticipo','venta_tarjeta')), fuente TEXT CHECK(fuente IN('dinero','tarjeta_regalo')),
  metodo TEXT, monto REAL CHECK(monto>0), estatus TEXT DEFAULT 'cobrado', corte_id TEXT REFERENCES cortes, corte_cancelacion_id TEXT REFERENCES cortes);
CREATE TABLE mov_tarjeta(id INTEGER PRIMARY KEY, tarjeta_id TEXT REFERENCES tarjetas, tipo TEXT, monto REAL, pago_id TEXT, descuento_id TEXT);

-- vistas = definiciones del diseño
CREATE VIEW saldo_tarjeta AS SELECT t.id, t.tipo, COALESCE(SUM(m.monto),0) saldo FROM tarjetas t LEFT JOIN mov_tarjeta m ON m.tarjeta_id=t.id GROUP BY t.id;
CREATE VIEW cuenta_servicio AS SELECT s.id, s.precio+s.total_productos-COALESCE((SELECT SUM(monto) FROM descuentos d WHERE d.servicio_id=s.id AND d.estatus='aplicado'),0) total,
  COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.servicio_id=s.id AND p.estatus='cobrado'),0) cobrado FROM servicios s;
-- corte pendiente: cobros de dinero sin corte + ajustes (dinero cortado y cancelado después)
CREATE VIEW corte_pendiente AS
  SELECT metodo, SUM(monto) monto, 'cobro' clase FROM pagos WHERE fuente='dinero' AND estatus='cobrado' AND corte_id IS NULL GROUP BY metodo
  UNION ALL
  SELECT metodo, -SUM(monto), 'ajuste' FROM pagos WHERE fuente='dinero' AND estatus='cancelado' AND corte_id IS NOT NULL AND corte_cancelacion_id IS NULL GROUP BY metodo;
CREATE TABLE resultado_cortes(corte TEXT, metodo TEXT, monto REAL, clase TEXT);

-- ===== Día 1 =====
-- S1: venta de tarjeta T1 $1000 en efectivo
INSERT INTO tarjetas VALUES('T1','BL-7K3Q-9','venta',1000,'activa');
INSERT INTO pagos(id,dia,tarjeta_id,concepto,fuente,metodo,monto) VALUES('P1',1,'T1','venta_tarjeta','dinero','Efectivo',1000);
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto,pago_id) VALUES('T1','emision',1000,'P1');
-- Anticipo: cita CX aparta con $400 en efectivo (aún sin servicio)
INSERT INTO pagos(id,dia,cita_id,concepto,fuente,metodo,monto) VALUES('P0',1,'CX','anticipo','dinero','Efectivo',400);
-- Corte 1 (transacción: guarda resultado y liga pagos)
INSERT INTO cortes VALUES('K1',1);
INSERT INTO resultado_cortes SELECT 'K1',* FROM corte_pendiente;
UPDATE pagos SET corte_cancelacion_id='K1' WHERE fuente='dinero' AND estatus='cancelado' AND corte_id IS NOT NULL AND corte_cancelacion_id IS NULL;
UPDATE pagos SET corte_id='K1', corte_cancelacion_id=CASE WHEN estatus='cancelado' THEN 'K1' END WHERE fuente='dinero' AND corte_id IS NULL;

-- ===== Día 2 =====
-- S2: facial $800 = $600 de T1 + $200 tarjeta bancaria
INSERT INTO servicios VALUES('SR2',800,0);
INSERT INTO pagos(id,dia,servicio_id,tarjeta_id,concepto,fuente,metodo,monto) VALUES('P2',2,'SR2','T1','servicio','tarjeta_regalo','Tarjeta de regalo',600);
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto,pago_id) VALUES('T1','redencion',-600,'P2');
INSERT INTO pagos(id,dia,servicio_id,concepto,fuente,metodo,monto) VALUES('P3',2,'SR2','servicio','dinero','Tarjeta',200);
-- S4: cortesía T2 $300 sobre servicio de $500, resto efectivo
INSERT INTO tarjetas VALUES('T2','BL-C0RT-1','cortesia',300,'activa');
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto) VALUES('T2','emision',300);
INSERT INTO servicios VALUES('SR4',500,0);
INSERT INTO descuentos VALUES('D1','SR4','cortesia','T2',300,'aplicado');
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto,descuento_id) VALUES('T2','redencion',-300,'D1');
INSERT INTO pagos(id,dia,servicio_id,concepto,fuente,metodo,monto) VALUES('P5',2,'SR4','servicio','dinero','Efectivo',200);
-- S5: cupón 20% sobre $500, resto transferencia
INSERT INTO servicios VALUES('SR5',500,0);
INSERT INTO descuentos VALUES('D2','SR5','cupon',NULL,100,'aplicado');
INSERT INTO pagos(id,dia,servicio_id,concepto,fuente,metodo,monto) VALUES('P6',2,'SR5','servicio','dinero','Transferencia',400);
-- Cierre de la cita CX con anticipo: servicio $1000 (incluye producto de $200), se liga el anticipo y se cobra el resto
INSERT INTO servicios VALUES('SR6',800,200);
UPDATE pagos SET servicio_id='SR6' WHERE cita_id='CX' AND concepto='anticipo';
INSERT INTO pagos(id,dia,servicio_id,concepto,fuente,metodo,monto) VALUES('P7',2,'SR6','servicio','dinero','Efectivo',600);
INSERT INTO cortes VALUES('K2',2);
INSERT INTO resultado_cortes SELECT 'K2',* FROM corte_pendiente;
UPDATE pagos SET corte_cancelacion_id='K2' WHERE fuente='dinero' AND estatus='cancelado' AND corte_id IS NOT NULL AND corte_cancelacion_id IS NULL;
UPDATE pagos SET corte_id='K2', corte_cancelacion_id=CASE WHEN estatus='cancelado' THEN 'K2' END WHERE fuente='dinero' AND corte_id IS NULL;

-- ===== Día 3 =====
-- S6: P3 (Tarjeta $200, ya cortado) era en realidad efectivo: se cancela y se registra el correcto
UPDATE pagos SET estatus='cancelado' WHERE id='P3';
INSERT INTO pagos(id,dia,servicio_id,concepto,fuente,metodo,monto) VALUES('P3b',3,'SR2','servicio','dinero','Efectivo',200);
-- S3: canje de los $400 restantes de T1 en servicio de $400
INSERT INTO servicios VALUES('SR3',400,0);
INSERT INTO pagos(id,dia,servicio_id,tarjeta_id,concepto,fuente,metodo,monto) VALUES('P4',3,'SR3','T1','servicio','tarjeta_regalo','Tarjeta de regalo',400);
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto,pago_id) VALUES('T1','redencion',-400,'P4');
-- S7: venta de T3 $1000 efectivo y reembolso el mismo día, sin uso, antes del corte
INSERT INTO tarjetas VALUES('T3','BL-R3FN-4','venta',1000,'activa');
INSERT INTO pagos(id,dia,tarjeta_id,concepto,fuente,metodo,monto) VALUES('P8',3,'T3','venta_tarjeta','dinero','Efectivo',1000);
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto,pago_id) VALUES('T3','emision',1000,'P8');
UPDATE pagos SET estatus='cancelado' WHERE id='P8';
INSERT INTO mov_tarjeta(tarjeta_id,tipo,monto,pago_id) VALUES('T3','cancelacion',-1000,'P8');
UPDATE tarjetas SET estatus='cancelada' WHERE id='T3';
INSERT INTO cortes VALUES('K3',3);
INSERT INTO resultado_cortes SELECT 'K3',* FROM corte_pendiente;
UPDATE pagos SET corte_cancelacion_id='K3' WHERE fuente='dinero' AND estatus='cancelado' AND corte_id IS NOT NULL AND corte_cancelacion_id IS NULL;
UPDATE pagos SET corte_id='K3', corte_cancelacion_id=CASE WHEN estatus='cancelado' THEN 'K3' END WHERE fuente='dinero' AND corte_id IS NULL;

.mode box
SELECT '== Cortes ==' x;
SELECT corte, clase, metodo, monto FROM resultado_cortes ORDER BY corte, clase, metodo;
SELECT corte, SUM(monto) total_neto FROM resultado_cortes GROUP BY corte;
SELECT '== Servicios: total, cobrado (cualquier fuente), estatus derivado ==' x;
SELECT id, total, cobrado, CASE WHEN cobrado>=total-0.005 THEN 'pagado' WHEN cobrado>0 THEN 'parcial' ELSE 'pendiente' END estatus FROM cuenta_servicio;
SELECT '== Tarjetas ==' x;
SELECT * FROM saldo_tarjeta;
SELECT '== Cuadre ==' x;
SELECT (SELECT SUM(monto) FROM resultado_cortes) dinero_neto_cortado,
       (SELECT SUM(total) FROM cuenta_servicio) ventas_netas,
       (SELECT SUM(saldo) FROM saldo_tarjeta WHERE tipo='venta') pasivo_tarjetas_vendidas,
       (SELECT SUM(total-cobrado) FROM cuenta_servicio) por_cobrar,
       (SELECT SUM(monto) FROM pagos WHERE concepto='anticipo' AND servicio_id IS NULL AND estatus='cobrado') anticipos_sin_aplicar;
SELECT '== Cada pago de dinero contado exactamente una vez como ingreso ==' x;
SELECT COUNT(*) pagos_dinero_sin_corte FROM pagos WHERE fuente='dinero' AND corte_id IS NULL;
SELECT '== Modelo ingenuo (tarjeta de regalo, cortesía y cupón como métodos de pago) ==' x;
SELECT (SELECT SUM(monto) FROM pagos WHERE estatus='cobrado') + 300 + 100 AS corte_ingenuo_total;
