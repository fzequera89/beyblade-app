-- IMPORTANTE: correr este archivo SOLO, en su propia ejecución.
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que después
-- referencia ese valor nuevo (el archivo 0006 sí puede correr justo después, aparte).

alter type match_status add value if not exists 'pending' before 'reported';
