# La Dieci — Rediseño del sistema de pedidos y delivery
### Resumen de la discusión técnica del 11 de mayo de 2026

> Documento preparado para el propietario de la pizzería La Dieci como resumen
> de la discusión mantenida con el asistente técnico sobre los problemas
> detectados durante el servicio del 10 de mayo y las decisiones tomadas
> para corregirlos. Lenguaje no técnico cuando es posible; los datos numéricos
> se mantienen tal cual aparecieron en pantalla.

---

## 1. Punto de partida

Tras el servicio del **10 de mayo de 2026** (domingo), el operador detectó
que los importes mostrados por la aplicación no coincidían **en ninguna
pantalla**: ni en Pedidos, ni en Listos, ni en Entregas, ni en Economía.

Las fotos enviadas (capturas reales del servicio) mostraron tres
discrepancias graves entre los números, además de un error visible
("Error al cerrar servicio") al final de la noche.

**Sospecha inicial del operador**: cuando un pedido entra en "Listos",
el sistema le suma **otros 2,50 € de delivery además de los que ya
estaban incluidos**, contándolos dos veces.

**Decisión inicial del operador**: basta de parches. El sistema de cálculo
de totales debe rehacerse desde cero, de forma limpia, sostenible y fácil
de mantener.

---

## 2. Verificación de los datos reales

### 2.1 Lo que dice el Excel oficial (la verdad)

| Día | Pedidos | Total caja | Pizzas |
|---|---|---|---|
| 10/05 | 27 | **822,00 €** | 57 |

### 2.2 Lo que mostraban las pantallas de la app esa noche

| Pantalla | Total mostrado | Diferencia respecto al Excel |
|---|---|---|
| Excel oficial | 822,00 € | — |
| Listos (foto 1) | 849,50 € | **+27,50 €** (= 11 × 2,50 €) |
| Listos (foto 2) | 795,50 € | -26,50 € |
| Entregas (parcial) | 376,50 € | — |

La diferencia de **+27,50 €** coincide exactamente con **11 entregas a
domicilio × 2,50 €**: confirmación matemática de que el coste de envío
se contaba **dos veces** en el resumen agregado de la pantalla "Listos".

### 2.3 Comparación entre pantallas

Mismo cliente, mismo pedido, dos importes distintos según la pantalla:

| Cliente | Entregas | Listos | Diferencia |
|---|---|---|---|
| #006 ZAHIRA | 30,50 € | 33,00 € | +2,50 |
| #010 CAROL MALPICA | 34,50 € | 37,00 € | +2,50 |
| #013 ANA MARTINEZ | 29,50 € | 32,00 € | +2,50 |
| #018 CHEMILLA | 17,00 € | 19,50 € | +2,50 |
| #020 JESUS IBORRA | 68,00 € | 70,50 € | +2,50 |
| #022 MAYA | 31,50 € | 34,00 € | +2,50 |

Cada domicilio aparecía con un importe diferente en cada pantalla,
exactamente con 2,50 € de diferencia.

### 2.4 Estado real en la base de datos

Verificación directa sobre Supabase (la base de datos oficial del sistema):

| Origen | Pedidos 10/05 | Total | Domicilios |
|---|---|---|---|
| Excel oficial | 27 | **822,00 €** | — |
| Tabla `storico` (Supabase) | 27 | **822,00 €** | 11 |
| Backup automático 23:50 | 27 | **822,00 €** | — |

**Conclusión importante**: los datos del 10/05 estaban **correctos y
guardados a salvo en la base de datos**. La pantalla "Error al cerrar
servicio" fue un mensaje pasajero — la copia automática a las 23:50
sí se completó correctamente.

**Es decir: el caos numérico era solo de pantalla, no de los datos
reales**. La aplicación calculaba mal lo que mostraba a partir de
datos buenos.

---

## 3. Causa raíz del problema

Tras inspeccionar el código, se descubrió que el cálculo del total de
un pedido estaba **implementado en 7 lugares diferentes** de la
aplicación, cada uno con una fórmula ligeramente distinta. Algunos
sumaban el coste de envío, otros no; algunos lo sumaban dos veces.

El motivo es que el coste de envío de 2,50 € se gestionaba con **dos
mecanismos a la vez**:

1. Como un "producto fantasma" llamado *"Entrega a domicilio"* metido
   dentro de la lista de productos del pedido.
2. Como un flag aparte (`tipo_consegna = "DOMICILIO"`) que dispara
   sumas adicionales en varios cálculos.

La convivencia de los dos mecanismos hacía que algunas pantallas
contaran el coste una vez, otras dos veces y otras ninguna.

**Diagnóstico del operador**: "Estamos poniendo tiritas por todos
lados, no sirve de nada. Hay una hemorragia debajo. Hay que rehacer
el sistema entero, limpio."

Decisión: **basta de parches, se reconstruye el sistema de cálculo
de totales con un único principio: una sola fuente de verdad.**

---

## 4. El nuevo sistema (rediseño aprobado)

### 4.1 Principio rector

**Un pedido tiene un único total, calculado una sola vez en el momento
de la creación o modificación, y guardado en la base de datos. Todas
las pantallas leen ese total tal cual, sin volver a calcularlo.**

### 4.2 Cambios en la base de datos

Se añadieron dos columnas nuevas a la tabla de pedidos:

- `delivery_fee` → coste de envío en euros (0 € si RETIRO, 2,50 € si DOMICILIO)
- `totale` → total del pedido = suma de productos + delivery_fee

Y la columna `delivery_fee` también se añadió a la tabla `storico`
(histórico) para conservar el dato.

Estructura final, sencilla y clara:

```
Pedido
├── productos: [pizza1, pizza2, bebida, ...]   ← solo productos reales
├── tipo_entrega: "DOMICILIO" o "RETIRO"
├── delivery_fee: 0,00 € o 2,50 €              ← columna nueva
└── total: suma de productos + delivery_fee    ← columna nueva
```

El "producto fantasma" *"Entrega a domicilio"* ya **no existe más**
dentro de la lista de productos. El coste de envío vive solo en su
columna `delivery_fee`.

### 4.3 Ventaja para el futuro

Si algún día se decide subir el coste de envío a 3 € o ajustarlo por
zona, basta cambiar **un solo valor** en un sitio. Antes había que
modificar siete archivos diferentes.

### 4.4 Migración de los datos históricos

Los 76 pedidos históricos ya guardados se han limpiado uno por uno:

- 22 pedidos de domicilio "con producto fantasma" → producto fantasma
  eliminado, `delivery_fee` puesto a 2,50 €, total **idéntico** al
  anterior (no cambia ningún número, solo se ordena la información).
- 4 pedidos de domicilio antiguos (mayo 1-3) sin producto fantasma →
  dejados intactos para no alterar los importes que ya constan en el Excel.
- 50 pedidos de retiro → `delivery_fee` a 0, sin cambios.

**Verificación final**: los 76 pedidos del histórico son coherentes
matemáticamente (total = productos + delivery_fee). El total del 10/05
sigue siendo exactamente **822,00 €**, idéntico al Excel del propietario.

---

## 5. Despliegue en producción

El nuevo sistema se ha puesto en producción esta mañana, 11 de mayo:

| Componente | Estado | Hora |
|---|---|---|
| Base de datos Supabase | Migrada y verificada | mañana |
| Backend (Railway) | Desplegado, salud 200 OK | mañana |
| Frontend (Netlify) | Desplegado, nueva versión activa | mañana |

A partir de esta noche, todos los pedidos nuevos seguirán el sistema
limpio. Las pantallas Pedidos, Listos, Entregas, Economía y el resumen
de servicio mostrarán todas el **mismo número** para el mismo pedido.

---

## 6. Cómo verificar esta noche

Se sugiere al operador y al propietario hacer estas pruebas en el
servicio de hoy:

1. Crear un pedido manual de **RETIRO** con 2 pizzas → el total debe
   ser la suma de las pizzas, sin nada extra.
2. Crear un pedido manual de **DOMICILIO** con dirección → el total
   debe ser la suma de las pizzas + 2,50 € de envío, mostrado claramente
   en la tarjeta.
3. Modificar un pedido (añadir o quitar una pizza) → el total debe
   actualizarse correctamente en todas las pantallas.
4. Al cerrar el servicio → el histórico debe contener el mismo total
   que aparecía en la app durante la noche.
5. Sumar manualmente los totales de las tarjetas de "Listos" → debe
   coincidir exactamente con el total "en caja" mostrado en la parte
   inferior.

---

## 7. Temas abiertos para discutir con el propietario

### 7.1 Las zonas de delivery (Q1, Q2, Q3, Q4)

Actualmente la pizzería tiene **4 zonas** definidas a mano con polígonos
reales sobre el mapa:

| Zona | Nombre | Tiempo viaje | Pedidos máx. por viaje |
|---|---|---|---|
| Q1 | CENTRO + BUENAVISTA | 15 min | 4 |
| Q2 | LAS MARINAS | 18 min | 2 |
| Q3 | IES | 12 min | 5 |
| Q4 | CORTIJOS | 20 min | 2 |

El operador siente que el modelo actual no funciona bien y propone
abrir una discusión seria sobre cómo replantearlo. La pizzería está
situada en **Plaza Itálica 8**, lo que significa que tiene el **mar
detrás** (al este) y se expande en **180°** hacia el oeste/norte/sur.
Casi no hay clientes potenciales detrás.

**Cinco modelos posibles a comparar** (se preparará un informe
detallado para la reunión):

1. **Más zonas, más pequeñas** (6-8 zonas). Ventaja: tiempos más
   precisos por zona. Desventaja: complejidad operativa, "huecos"
   entre zonas.
2. **Menos zonas, más grandes** (2-3 macro-áreas). Ventaja: simplicidad.
   Desventaja: tiempos medios poco fiables.
3. **Coronas concéntricas** (anillos de 1 km, 2 km, 3 km desde la
   pizzería). Ventaja: matemáticamente natural dado que el mar
   elimina medio círculo; tiempos correlacionados con la distancia.
   Desventaja: ignora las calles reales y la asimetría norte/sur.
4. **Sin zonas, solo radio máximo + franjas horarias** ("repartimos
   hasta X minutos desde la pizzería, más lejos no"). Ventaja: muy
   simple. Desventaja: el repartidor debe optimizar él solo el viaje.
5. **Reparto dinámico** — la app agrupa los pedidos por franja horaria
   y sugiere el viaje. Sin zonas fijas. Desventaja: requiere geolocalización
   fiable de cada pedido.

**Propuesta**: discutirlo esta tarde con datos reales sobre la mano,
preparando antes un informe que analice la urbanística de Roquetas de
Mar, las distancias reales en moto desde Plaza Itálica a cada barrio,
y los pros y contras de cada modelo.

### 7.2 Un problema importante para futuras decisiones

Durante el análisis se descubrió que **la aplicación nunca ha guardado
las direcciones de los pedidos pasados**. La base de datos `clientes`
existe pero está **vacía de direcciones** (73 clientes, 0 con dirección).
La tabla `storico` ni siquiera tiene la columna `dirección`.

**Consecuencia**: hoy no es posible analizar "desde dónde vienen
realmente los pedidos" con datos reales. La discusión sobre las zonas
tiene que basarse en urbanística + intuición del propietario, no en
estadísticas.

**Recomendación**: cambiar la aplicación esta semana para que **empiece
a guardar la dirección de cada pedido a domicilio** en el histórico
y en la ficha del cliente. En 2-3 semanas se dispondría de un dataset
real con el que tomar decisiones definitivas sobre las zonas.

### 7.3 El sistema de geocodificación actual

El sistema actual reconoce la dirección que escribe el operador y
calcula la zona de la siguiente manera:

1. **Nominatim** (OpenStreetMap, gratuito) traduce la dirección a
   coordenadas.
2. Si falla → **Photon** (Komoot, gratuito, más tolerante a errores
   de escritura).
3. Si también falla → coincidencia por palabra clave
   ("las marinas" → Q2, "buenavista" → Q1, etc.).
4. Las coordenadas se cruzan con los polígonos de las 4 zonas para
   asignar la zona del pedido.

El sistema sabe **dónde vive el cliente** y **en qué zona cae**.
**No sabe** dónde está el repartidor en tiempo real, ni cuánto tarda
de verdad cada entrega.

### 7.4 GPS del repartidor — ¿conectar o no?

Posibilidad de equipar al repartidor con un teléfono que envíe su
posición GPS al sistema en tiempo real.

**Ventajas reales:**
- El operador ve el punto del repartidor en el mapa, sabe cuándo
  volverá → puede preparar el próximo viaje al instante.
- Tiempo estimado de vuelta real, no estimado.
- Tras 1-2 meses, datos reales de tiempos de entrega por zona →
  recalibrar las zonas sobre datos, no a sensación.
- Mensaje al cliente vía WhatsApp: "el repartidor está a 5 min."
- Seguridad: si el repartidor desaparece o cae, se ve.

**Desventajas:**
- El repartidor tiene que tener el teléfono cargado, desbloqueado y
  la aplicación abierta durante todo el viaje.
- En iPhone el GPS se desactiva si la aplicación pasa a segundo plano
  (restricción de Apple) — problema serio para una app web.
- Consumo de batería elevado (~30 % por una noche).
- Más complejidad técnica y más tráfico al servidor.

**Recomendación del asistente** — propuesta de 3 niveles, del más
sencillo al más complejo:

**Nivel 0** *(1 hora de trabajo, gratis, hacer ya)*
Añadir `dirección`, `zona`, `coordenadas` a la tabla `storico`. Empezar
a guardar las direcciones de los pedidos de cada noche. En 2 semanas
disponemos de un dataset real.

**Nivel 1** *(1 día de trabajo, coste prácticamente 0 €/mes)*
Cuando el operador confirma un pedido a domicilio, la app llama a un
servicio de mapas y calcula **distancia en km y tiempo en moto** de
Plaza Itálica a la dirección del cliente. Permite medir si las zonas
Q1-Q4 actuales corresponden a tiempos reales (puede que Q2 sea "todos
18 min" pero algunos sean 12 min y otros 25 min).

**Dos opciones a elegir para el servicio de mapas:**

| Aspecto | Opción A — Google Maps | Opción B — OSRM (open source) |
|---|---|---|
| **Coste mensual** | 0 € hasta 10 000 llamadas/mes. Pago solo más allá de 330 pedidos/día | **0 € siempre**, sin límites ni vigilancia |
| **Precisión en Roquetas** | Excelente, datos de Google actualizados al minuto | Muy buena en zonas urbanas, suficiente para un radio de 5 km |
| **Tiempos de tráfico en tiempo real** | Sí (sabe si hay tráfico esta noche) | No, calcula sobre velocidad media de cada calle |
| **Dependencia de un tercero** | Sí, Google puede cambiar tarifas o quitar la cuota gratuita | No, se instala en nuestro propio servidor |
| **Necesita tarjeta de crédito** | Sí, aunque no se cobre nada | No |
| **Trabajo de configuración** | Activar API key (10 min) | Instalar OSRM en el servidor (~2 horas) |
| **Escenario peor** | ~4 €/mes si Google quitara la cuota gratuita | Sigue siendo 0 €, nunca cambia |

**Recomendación**: para empezar, **Google Maps**. Razón: cero
configuración extra, datos siempre actualizados, y mientras La Dieci
no llegue a ser una cadena de pizzerías estamos siempre en la cuota
gratuita. Si en el futuro el propietario prefiere independencia total
de Google, se puede migrar a OSRM en una segunda fase sin cambiar la
parte de la aplicación que ya funciona — solo se cambia el "motor"
de mapas por debajo.

**Nivel 2** *(3-5 días de trabajo)*
GPS del repartidor en vivo. **Solo si** después de los niveles 0+1
realmente hace falta porque la pizzería crece y la gestión del viaje
del repartidor se convierte en el cuello de botella. **Por ahora no
merece la pena.**

---

## 8. Resumen y siguiente paso

### Hecho hoy (mañana del 11 de mayo)

- Sistema de cálculo de totales reconstruido, limpio y mantenible.
- Base de datos migrada sin pérdida de datos. Total del 10/05 sigue
  siendo 822,00 €.
- Backend y frontend desplegados en producción.
- A partir del servicio de esta noche, todos los importes serán
  coherentes en todas las pantallas.

### Para hablar con el propietario esta tarde

1. ¿Cuántas zonas tiene sentido tener para La Dieci, dadas su ubicación
   (mar detrás) y su capacidad (1 repartidor)?
2. ¿Vamos a empezar a guardar las direcciones de los pedidos a domicilio
   desde esta semana, para tener datos reales en 2-3 semanas?
3. ¿Queremos invertir un día de trabajo (coste mensual prácticamente
   cero, gracias al tramo gratuito de Google Maps) en obtener tiempos
   y distancias reales vía Google Maps por cada pedido?

### Para el futuro (no urgente)

- Activar las políticas de seguridad RLS en las tablas de Supabase
  (no es crítico hoy, pero conviene cerrarlo antes del verano).
- Considerar el GPS del repartidor solo si las medidas más simples
  no resuelven el problema.

---

*Documento generado el 11 de mayo de 2026, antes de la reunión de
la tarde con el propietario. Para cualquier duda técnica, el asistente
queda disponible para profundizar punto por punto.*
