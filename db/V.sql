UPDATE users
SET dni = CASE
    WHEN dni LIKE 'V-%' THEN dni
    WHEN dni LIKE 'V%' AND dni NOT LIKE 'V-%' THEN 'V-' || SUBSTR(dni, 2)
    WHEN CAST(dni AS INTEGER) > 0 THEN 'V-' || dni
    ELSE dni
END
WHERE 
    dni LIKE 'V%'
    OR (CAST(dni AS INTEGER) > 0 AND dni NOT LIKE '%-%');