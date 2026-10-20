# Weft design direction

Dial: ENERGY 1 / RHYTHM 1 / MOTION 1

A collaborative canvas where the board is the product and the chrome stays quiet.

## Identity: every person is a thread

The weft is the thread passed across a loom. Each person on a board picks a thread
color, and that color is their accent everywhere: their selection frame and handles,
their active-tool mark, their text caret, the ring around their avatar, their cursor and
name tag as others see it. Your selection looks the same on your screen and on your
collaborators', so color answers "whose is this?" without a legend.

The chrome itself is neutral ink on white. The only color in the interface comes from
people and from what they draw.

## Palette

| Token        | Light     | Dark      | Use                                |
| ------------ | --------- | --------- | ---------------------------------- |
| board        | `#F1F2F4` | `#1A1C20` | Canvas background, cool loom grey  |
| surface      | `#FFFFFF` | `#24272C` | Floating bars, menus, dialogs      |
| ink          | `#14161A` | `#E9EBEE` | Text, icons, primary buttons       |
| muted        | `#5C6370` | `#9AA1AC` | Secondary text (5.4:1, 6.6:1)      |
| control-line | `#8A909B` | `#6F7682` | Input and secondary button borders |
| grid         | `#D2D6DC` | `#30343B` | Board crosses                      |

Threads: Orange `#E8590C`, Cobalt `#4263EB`, Green `#2F9E44`, Violet `#7950F2`,
Teal `#1098AD`, Red `#E03131`, Pink `#D6336C`, Blue `#1971C2`. Each keeps 3:1 against the
board in both themes, and its name-tag text color is chosen for 4.5:1.

Content colors (ink, red, orange, yellow, green, blue, violet) are per-theme and pass
4.5:1 on the board, so text shapes stay readable for collaborators on either theme.

## Type

Onest, one variable family for chrome and board text. It has full Cyrillic, so notes
written in Russian render in the same face.

## Logo

A weave seen in cross-section: four warp threads as ink dots, and one weft thread passing
over, under, over and under them in the viewer's own color. The word "weft" sits beside it
in Onest 700. The favicon uses the same mark in Cobalt.

## Board surface

Small crosses instead of dots: the intersections of warp and weft. They give motion
feedback while panning an empty board and fade out when zoomed far out.

## Shape and depth

12px floating bars, 8px controls, 16px dialogs and the welcome card. One shadow token,
used only on chrome that floats above the board, plus a soft shadow under sticky notes.

## Motion

Remote cursors glide between network updates. Toasts rise 6px when they appear.
Nothing loops; reduced motion removes both.

## First run

An empty board shows one card with two real actions: open the same board in a second
window to see collaboration immediately, or start from a sample.
