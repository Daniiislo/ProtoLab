<!-- ppt-master-schema: spec-lock/v1 -->
# Execution Lock

## canvas
- format: PPT 16:9
- viewBox: 0 0 1280 720

## communication
- primary_language: en
- audience: Developers familiar with basic HTTP
- objective: Explain four browser-server methods and practical reliability choices
- core_message: Match the interaction pattern; reliability is application work
- consumption_mode: presentation

## mode
- mode: custom
- mode_behavior: Two pain points introduce four communication patterns; conclude with operational lessons and demo. Preserve the 12-page order.

## visual_style
- visual_style: custom
- visual_style_behavior: Light technical schematic, navy text and cyan signals. Browser frames and lifelines communicate ownership and direction. Whitespace and semantic geometry lead; no decorative texture.

## colors
- background: #F7F9FC
- secondary_bg: #E8F4F8
- primary: #102A43
- accent: #007F9E
- secondary_accent: #15836B
- body_text: #243B53
- secondary_text: #526B80
- divider: #CAD7E2
- white: #FFFFFF
- warning: #B36A13

## typography
- font_family: Segoe UI
- title_family: Segoe UI
- body_family: Segoe UI
- title: 48
- body: 28
- subtitle: 32
- annotation: 20
- footnote: 14
- display: 72
- code: 22
- code_family: Consolas

## icons
- library: tabler-outline
- stroke_width: 2
- inventory: bell, message-circle, database, shield-check, wifi-off, refresh, browser, server

## page_rhythm
- P01: anchor
- P02: anchor
- P03: breathing
- P04: breathing
- P05: anchor
- P06: dense
- P07: dense
- P08: dense
- P09: dense
- P10: breathing
- P11: breathing
- P12: anchor

## pptx_structure
- mode: flat

## forbidden
- technical: mask, <style>, class, external CSS, <foreignObject>, textPath, @font-face, <animate*>, <set>, <script> / event attributes, <iframe>
- entities: HTML named entities in text; write typography as raw Unicode and escape XML reserved characters
