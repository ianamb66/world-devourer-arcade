# World Devourer

Juego arcade web en canvas. Eres una masa de arena blanca magnetizada que devora mundos en un mapa orbital amplio. Descompones planetas según su clase civilizatoria, capturas lunas y rompes defensas antes de que las civilizaciones escalen.

## Mecánicas

- Planetas clase I, II y III.
- Las clases altas alimentan más, pero tienen más escudos, torretas y satélites.
- Mapa más grande que la pantalla, con cámara que sigue al devorador para dar sensación de espacio.
- El devorador funciona visualmente como arena ferrofluida blanca: se estira, vibra y absorbe partículas de los planetas.
- Los planetas regeneran escudos, torretas y vida si no los terminas.
- Las civilizaciones evolucionan con el tiempo.
- Puedes capturar lunas al acercarte y lanzarlas como proyectiles.
- Las civilizaciones clase II/III también pueden usar lunas como armas.
- Pulso gravitacional destruye proyectiles, daña escudos/torretas y roba lunas cercanas.
- Tu masa baja con el tiempo: si no comes, colapsas.

## Controles

- `WASD` / flechas: moverte.
- Mouse/touch sostenido: impulsarte hacia el puntero.
- Click / `Space`: lanzar una luna capturada.
- `E`: pulso gravitacional.

## Controles moviles

- Joystick izquierdo: movimiento y direccion de lanzamiento.
- Boton **Luna**: lanzar luna capturada.
- Boton **Pulso**: activar pulso gravitacional.
- Si lanzas sin mover el joystick, la luna apunta al planeta mas cercano.

## Ejecutar local

```bash
python3 -m http.server 4180
```

Abrir:

```text
http://localhost:4180
```

## Archivos

- `index.html`: estructura de HUD y overlays.
- `styles.css`: dirección visual blanco/negro de arena arcade.
- `app.js`: loop, física, entidades, IA de civilizaciones y render canvas.
