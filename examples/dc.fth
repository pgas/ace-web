: C, ( char -- )
  HERE C! 1 ALLOT ;
: 2DUP ( x y -- x y x y )
  OVER OVER ;
: 2DROP ( x y -- )
  DROP DROP ;

CREATE PLAYER-CHAR 128 C, 64 C, 224 C, 80 C, 248 C, 40 C, 124 C,   0 C,
CREATE WALL-CHAR   255 C, 129 C, 189 C, 165 C, 165 C, 189 C, 129 C, 255 C,
CREATE FLOOR-CHAR    0 C,   0 C,   0 C,  24 C,  24 C,   0 C,   0 C,   0 C,

: DEF-CHAR ( addr char -- )
  8 * 11264 + ( Calculate UDG RAM target address )
  8 0 DO
    OVER I + C@ OVER I + C!
  LOOP
  2DROP ;

: INIT-GRAPHICS ( -- )
  PLAYER-CHAR 64 DEF-CHAR ( Redefine @ to Player tile )
  WALL-CHAR   35 DEF-CHAR ( Redefine # to Wall tile )
  FLOOR-CHAR  46 DEF-CHAR ( Redefine . to Floor tile )
;

CREATE MAP
  35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C,
  35 C, 46 C, 46 C, 46 C, 46 C, 35 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 35 C,
  35 C, 46 C, 35 C, 35 C, 46 C, 35 C, 46 C, 35 C, 35 C, 35 C, 35 C, 46 C, 35 C, 35 C, 46 C, 35 C,
  35 C, 46 C, 35 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 35 C, 46 C, 35 C, 46 C, 46 C, 35 C,
  35 C, 46 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 46 C, 35 C, 35 C, 46 C, 35 C, 35 C, 46 C, 35 C,
  35 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 35 C, 46 C, 35 C, 46 C, 46 C, 46 C, 46 C, 46 C, 35 C,
  35 C, 35 C, 35 C, 35 C, 46 C, 35 C, 46 C, 35 C, 46 C, 35 C, 46 C, 35 C, 35 C, 35 C, 35 C, 35 C,
  35 C, 46 C, 46 C, 35 C, 46 C, 35 C, 46 C, 46 C, 46 C, 46 C, 46 C, 35 C, 46 C, 46 C, 46 C, 35 C,
  35 C, 46 C, 35 C, 35 C, 46 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 46 C, 35 C, 46 C, 35 C,
  35 C, 46 C, 46 C, 46 C, 46 C, 35 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 46 C, 35 C, 46 C, 35 C,
  35 C, 46 C, 35 C, 35 C, 46 C, 46 C, 46 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 46 C, 35 C,
  35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C, 35 C,

: DRAW-MAP ( -- )
  CLS
  12 0 DO
    16 0 DO
      I J 16 * + MAP + C@ EMIT
    LOOP
    CR
  LOOP ;

: SCREEN-ADDR ( x y -- addr )
  32 * + 9216 + ; ( 9216 is Ace Video RAM )

: GET-TILE ( x y -- char )
  16 * + MAP + C@ ;

: DRAW-PLAYER ( x y -- )
  SCREEN-ADDR 64 SWAP C! ; ( Draw @ )

: CLEAR-PLAYER ( x y -- )
  SCREEN-ADDR 46 SWAP C! ; ( Restore . )

: VALID-MOVE? ( x y -- flag )
  GET-TILE 35 = IF 0 ELSE 1 THEN ;

: GET-KEY ( -- char )
  BEGIN
    INKEY DUP
  UNTIL ;

: PLAY ( -- )
  INIT-GRAPHICS
  DRAW-MAP
  2 2 ( Initial Player position X=2 Y=2 )
  BEGIN
    2DUP DRAW-PLAYER
    GET-KEY
    DUP 53 = IF ( 5 - Move Left )
      DROP OVER 1 - OVER VALID-MOVE? IF
        2DUP CLEAR-PLAYER SWAP 1 - SWAP
      THEN 1
    ELSE DUP 54 = IF ( 6 - Move Down )
      DROP 2DUP 1 + VALID-MOVE? IF
        2DUP CLEAR-PLAYER 1 +
      THEN 1
    ELSE DUP 55 = IF ( 7 - Move Up )
      DROP 2DUP 1 - VALID-MOVE? IF
        2DUP CLEAR-PLAYER 1 -
      THEN 1
    ELSE DUP 56 = IF ( 8 - Move Right )
      DROP OVER 1 + OVER VALID-MOVE? IF
        2DUP CLEAR-PLAYER SWAP 1 + SWAP
      THEN 1
    ELSE DUP 81 = IF ( Q - Quit )
      DROP 0
    ELSE
      DROP 1
    THEN THEN THEN THEN THEN
    0=
  UNTIL
  2DROP CLS ." GAME OVER." CR ;
