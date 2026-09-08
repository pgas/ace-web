( ========================================================= )
( LES TRESORS DE ROM - JUPITER ACE FORTH EDITION           )
( File: tor.fth                                            )
( Adapted from classic French BASIC game by Jean-Christophe )
( Elies & Michel Brassinne (1983)                           )
( Enhanced with custom UDG graphics & sound effects        )
( ========================================================= )

( --- Helper Primitives --- )
: 2* ( n -- 2n ) 2 * ;
: LTE ( n1 n2 -- flag ) > 0= ;
: GTE ( n1 n2 -- flag ) < 0= ;
: ZLTE ( n -- flag ) 0> 0= ;
: ZGTE ( n -- flag ) 0< 0= ;
: NEQ ( n1 n2 -- flag ) = 0= ;
: COORD= ( x1 y1 x2 y2 -- flag ) ROT = ROT ROT = AND ;

: KEY ( -- char )
  BEGIN INKEY DUP UNTIL ;

: TO-UPPER ( char -- CHAR )
  DUP 97 GTE OVER 122 LTE AND IF 32 - THEN ;

: 2DUP ( x y -- x y x y )
  OVER OVER ;

: 2DROP ( x y -- )
  DROP DROP ;

( --- Pseudo-Random Number Generator --- )
VARIABLE SEED

: RND-INIT ( -- )
  15403 @ SEED ! ;

: RND ( max -- 0..max-1 )
  SEED @ 31421 * 6927 + DUP SEED !
  ABS SWAP MOD ;

( --- Graphic UDG Character Definitions --- )
CREATE TILE-HERO    24 C, 60 C, 24 C, 126 C, 90 C, 36 C, 66 C,  0 C,
CREATE TILE-WALL   255 C, 137 C, 137 C, 255 C, 145 C, 145 C, 255 C, 0 C,
CREATE TILE-FLOOR    0 C,   0 C,  16 C,   0 C,   0 C,  16 C,   0 C, 0 C,
CREATE TILE-LADDER 146 C, 146 C, 254 C, 146 C, 146 C, 254 C, 146 C, 0 C,
CREATE TILE-CHEST    0 C, 126 C, 129 C, 189 C, 165 C, 129 C, 255 C, 0 C,
CREATE TILE-GOBLIN   0 C, 102 C, 255 C, 126 C,  60 C,  24 C,  60 C, 0 C,
CREATE TILE-TROLL  129 C, 195 C, 255 C, 255 C, 126 C,  60 C, 102 C, 0 C,
CREATE TILE-GHOUL   60 C,  66 C, 165 C, 129 C, 126 C,  90 C,  66 C, 0 C,
CREATE TILE-LIZARD  28 C,  62 C, 124 C, 120 C, 124 C,  62 C,  30 C, 0 C,
CREATE TILE-MYSTERY 60 C,  66 C,  12 C,  24 C,  24 C,   0 C,  24 C, 0 C,

: DEF-CHAR ( src_addr char -- )
  8 * 11264 +
  8 0 DO
    OVER I + C@
    OVER I + C!
  LOOP
  2DROP ;

: INIT-GRAPHICS ( -- )
  TILE-HERO    64 DEF-CHAR ( @ = Hero )
  TILE-WALL    35 DEF-CHAR ( # = Wall )
  TILE-FLOOR   46 DEF-CHAR ( . = Floor )
  TILE-LADDER  104 DEF-CHAR ( h = Ladder )
  TILE-CHEST   111 DEF-CHAR ( o = Chest )
  TILE-GOBLIN  103 DEF-CHAR ( g = Goblin )
  TILE-TROLL   116 DEF-CHAR ( t = Troll )
  TILE-GHOUL   117 DEF-CHAR ( u = Ghoul )
  TILE-LIZARD  108 DEF-CHAR ( l = Lizardman )
  TILE-MYSTERY 109 DEF-CHAR ( m = Mystery Encounter )
;

( --- Sound Effects --- )
: SFX-STEP 40 10 BEEP ;
: SFX-GOLD 15 25 BEEP 10 35 BEEP ;
: SFX-HIT 150 30 BEEP ;
: SFX-HURT 250 50 BEEP ;
: SFX-WIN 25 40 BEEP 18 40 BEEP 12 70 BEEP ;
: SFX-DEAD 200 80 BEEP 300 120 BEEP ;

( --- Game Variables & Arrays --- )
VARIABLE GRID-W
VARIABLE GRID-H

VARIABLE P-VP
VARIABLE P-MAX-VP
VARIABLE P-GOLD
VARIABLE P-BANKED
VARIABLE P-FOR
VARIABLE P-AGI
VARIABLE P-INT
VARIABLE P-MAX-FOR
VARIABLE P-MAX-AGI
VARIABLE P-MAX-INT
VARIABLE P-SCORE
VARIABLE P-EXPED

VARIABLE P-RX
VARIABLE P-RY
VARIABLE EXIT-X
VARIABLE EXIT-Y

VARIABLE MON-HP
VARIABLE MON-TYPE
VARIABLE K-CODE

CREATE MAP-ROOMS 48 ALLOT
CREATE MAP-HWALL 48 ALLOT
CREATE MAP-VWALL 48 ALLOT

: ROOM-INDEX ( rx ry -- offset )
  GRID-W @ * + ;

: GET-ROOM ( rx ry -- val )
  ROOM-INDEX MAP-ROOMS + C@ ;

: SET-ROOM ( val rx ry -- )
  ROOM-INDEX MAP-ROOMS + C! ;

: GET-HWALL ( rx ry -- wall? )
  ROOM-INDEX MAP-HWALL + C@ ;

: SET-HWALL ( wall? rx ry -- )
  ROOM-INDEX MAP-HWALL + C! ;

: GET-VWALL ( rx ry -- wall? )
  ROOM-INDEX MAP-VWALL + C@ ;

: SET-VWALL ( wall? rx ry -- )
  ROOM-INDEX MAP-VWALL + C! ;

( --- Labyrinth Generation --- )
: GENERATE-MAZE ( -- )
  GRID-W @ GRID-H @ * 0 DO
    0 MAP-ROOMS I + C!
    1 MAP-HWALL I + C!
    1 MAP-VWALL I + C!
  LOOP

  GRID-H @ 0 DO
    GRID-W @ 1- 0 DO
      2 RND 0= IF
        0 I J SET-VWALL
      THEN
    LOOP
  LOOP

  GRID-H @ 1- 0 DO
    GRID-W @ 0 DO
      2 RND 0= IF
        0 I J SET-HWALL
      THEN
    LOOP
  LOOP

  GRID-H @ 0 DO
    GRID-W @ 0 DO
      10 RND DUP 4 < IF
        1+ I J SET-ROOM ( 1..4 = Monsters )
      ELSE DUP 6 < IF
        DROP 5 I J SET-ROOM ( 5 = Safe Chest )
      ELSE DUP 7 = IF
        DROP 6 I J SET-ROOM ( 6 = Trapped Chest )
      ELSE
        DROP 0 I J SET-ROOM ( 0 = Empty )
      THEN THEN THEN
    LOOP
  LOOP

  GRID-W @ RND EXIT-X !
  GRID-H @ RND EXIT-Y !
  0 EXIT-X @ EXIT-Y @ SET-ROOM

  EXIT-X @ P-RX !
  EXIT-Y @ P-RY !
;

( --- UI Display Engine --- )
: DRAW-FRAME ( -- )
  0 0 AT ." === LES TRESORS DE ROM ==="
  2 18 AT ." +-----------+"
  3 18 AT ." |HERO STATS |"
  4 18 AT ." +-----------+"
  5 18 AT ." |LIFE:      |"
  6 18 AT ." |GOLD:      |"
  7 18 AT ." |BANK:      |"
  8 18 AT ." |FOR :      |"
  9 18 AT ." |AGI :      |"
 10 18 AT ." |INT :      |"
 11 18 AT ." |EXP :      |"
 12 18 AT ." |SCO :      |"
 13 18 AT ." +-----------+"
 15 0 AT ." --------------------------------"
;

: DRAW-ROOM-BORDER ( -- )
  2 0 AT 18 0 DO 35 EMIT LOOP
  14 0 AT 18 0 DO 35 EMIT LOOP
  14 3 DO
    I 0 AT 35 EMIT
    16 0 DO 46 EMIT LOOP
    35 EMIT
  LOOP
;

: DRAW-DOORS ( -- )
  P-RY @ 0 > IF
    P-RX @ P-RY @ 1- GET-HWALL 0= IF
      2 8 AT 46 EMIT 46 EMIT
    THEN
  THEN
  P-RY @ GRID-H @ 1- < IF
    P-RX @ P-RY @ GET-HWALL 0= IF
      14 8 AT 46 EMIT 46 EMIT
    THEN
  THEN
  P-RX @ 0 > IF
    P-RX @ 1- P-RY @ GET-VWALL 0= IF
      7 0 AT 46 EMIT
      8 0 AT 46 EMIT
    THEN
  THEN
  P-RX @ GRID-W @ 1- < IF
    P-RX @ P-RY @ GET-VWALL 0= IF
      7 17 AT 46 EMIT
      8 17 AT 46 EMIT
    THEN
  THEN
;

: DRAW-ROOM-CONTENTS ( -- )
  P-RX @ EXIT-X @ = P-RY @ EXIT-Y @ = AND IF
    8 9 AT 104 EMIT ( Ladder h )
  THEN

  P-RX @ P-RY @ GET-ROOM DUP 0> IF
    8 9 AT
    DUP 1 = IF 103 EMIT THEN ( g = Goblin )
    DUP 2 = IF 116 EMIT THEN ( t = Troll )
    DUP 3 = IF 117 EMIT THEN ( u = Ghoul )
    DUP 4 = IF 108 EMIT THEN ( l = Lizardman )
    DUP 5 = IF 111 EMIT THEN ( o = Chest )
    DUP 6 = IF 111 EMIT THEN ( o = Chest )
  THEN DROP

  8 5 AT 64 EMIT ( Hero @ )
;

: DRAW-ROOM ( -- )
  DRAW-ROOM-BORDER
  DRAW-DOORS
  DRAW-ROOM-CONTENTS
;

: DRAW-STATS ( -- )
  5 25 AT P-VP @ .
  6 25 AT P-GOLD @ .
  7 25 AT P-BANKED @ .
  8 25 AT P-FOR @ .
  9 25 AT P-AGI @ .
 10 25 AT P-INT @ .
 11 25 AT P-EXPED @ .
 12 25 AT P-SCORE @ .
;

: DRAW-MAP ( -- )
  CLS
  0 0 AT ." === MAP OF ROM (ANY KEY) ==="
  GRID-H @ 0 DO
    I 2* 2+ 2 AT
    GRID-W @ 0 DO
      I J P-RX @ P-RY @ COORD= IF
        64 EMIT ( Hero @ )
      ELSE I J EXIT-X @ EXIT-Y @ COORD= IF
        104 EMIT ( Ladder h )
      ELSE I J GET-ROOM 0> IF
        109 EMIT ( m Encounter )
      ELSE
        46 EMIT ( . Cleared room )
      THEN THEN THEN
      SPACE
    LOOP
  LOOP
  SFX-STEP
  KEY DROP
  CLS
  DRAW-FRAME
;

( --- Encounters & Actions Subsystem --- )
: CLEAR-LOG ( -- )
  16 0 AT ."                                "
  17 0 AT ."                                "
  18 0 AT ."                                "
  19 0 AT ."                                "
;

: DO-MOVE ( dx dy -- )
  P-VP @ 1- P-VP !
  P-RY @ + DUP ZGTE OVER GRID-H @ < AND IF
    P-RY !
  ELSE DROP THEN
  P-RX @ + DUP ZGTE OVER GRID-W @ < AND IF
    P-RX !
  ELSE DROP THEN
  SFX-STEP
;

: DO-MOVE-NORTH ( -- )
  P-RY @ 0 > IF
    P-RX @ P-RY @ 1- GET-HWALL 0= IF
      0 -1 DO-MOVE
    THEN
  THEN ;

: DO-MOVE-SOUTH ( -- )
  P-RY @ GRID-H @ 1- < IF
    P-RX @ P-RY @ GET-HWALL 0= IF
      0 1 DO-MOVE
    THEN
  THEN ;

: DO-MOVE-WEST ( -- )
  P-RX @ 0 > IF
    P-RX @ 1- P-RY @ GET-VWALL 0= IF
      -1 0 DO-MOVE
    THEN
  THEN ;

: DO-MOVE-EAST ( -- )
  P-RX @ GRID-W @ 1- < IF
    P-RX @ P-RY @ GET-VWALL 0= IF
      1 0 DO-MOVE
    THEN
  THEN ;

: DO-HEAL ( -- )
  P-VP @ 20 < IF
    16 0 AT ." NEED AT LEAST 20 LIFE TO REST!"
  ELSE
    16 0 AT ." REST & HEAL: PRESS [F] [A] [I]"
    KEY TO-UPPER DUP
    70 = IF
      P-FOR @ P-MAX-FOR @ < IF
        P-FOR @ 1+ P-FOR !
        P-VP @ 20 - P-VP !
        SFX-GOLD
        17 0 AT ." STRENGTH INCREASED +1!     "
      THEN
    THEN DUP
    65 = IF
      P-AGI @ P-MAX-AGI @ < IF
        P-AGI @ 1+ P-AGI !
        P-VP @ 20 - P-VP !
        SFX-GOLD
        17 0 AT ." AGILITY INCREASED +1!      "
      THEN
    THEN
    DUP 73 = IF
      P-INT @ P-MAX-INT @ < IF
        P-INT @ 1+ P-INT !
        P-VP @ 20 - P-VP !
        SFX-GOLD
        17 0 AT ." INTELLIGENCE INCREASED +1! "
      THEN
    THEN DROP
  THEN
;

: DO-CHEST ( -- )
  P-RX @ P-RY @ GET-ROOM
  DUP 5 = IF
    DROP
    100 100 RND +
    DUP P-GOLD @ + P-GOLD !
    0 P-RX @ P-RY @ SET-ROOM
    SFX-GOLD
    16 0 AT ." CHEST OPENED! GOLD FOUND: " .
  ELSE 6 = IF
    P-VP @ 100 - P-VP !
    0 P-RX @ P-RY @ SET-ROOM
    SFX-HURT
    16 0 AT ." BOOBY TRAP TRIGGERED! -100 LIFE!"
  THEN THEN
;

: DO-COMBAT ( -- )
  20 RND 1+
  P-FOR @ > IF
    P-VP @ 1- P-VP !
    P-FOR @ 1- 0 MAX P-FOR !
    SFX-HURT
    16 0 AT ." MONSTER STRIKES! -1 LIFE -1 FOR"
  ELSE
    MON-HP @ 1- MON-HP !
    SFX-HIT
    16 0 AT ." YOU HIT THE MONSTER!        "
    MON-HP @ ZLTE IF
      100 50 RND +
      DUP P-GOLD @ + P-GOLD !
      0 P-RX @ P-RY @ SET-ROOM
      SFX-WIN
      17 0 AT ." VICTORY! SLAIN! GOLD + " .
    THEN
  THEN
;

: DO-AMADOUER ( -- )
  20 RND 1+
  P-INT @ > IF
    P-VP @ 1- P-VP !
    P-INT @ 1- 0 MAX P-INT !
    SFX-HURT
    16 0 AT ." COAX FAILED! -1 LIFE -1 INT   "
  ELSE
    15 15 RND +
    DUP P-GOLD @ + P-GOLD !
    0 P-RX @ P-RY @ SET-ROOM
    SFX-GOLD
    16 0 AT ." MONSTER TAMED! GOLD + " .
  THEN
;

: DO-FLEE ( -- )
  20 RND 1+
  P-AGI @ > IF
    P-VP @ 1- P-VP !
    P-AGI @ 1- 0 MAX P-AGI !
    SFX-HURT
    16 0 AT ." FLEE FAILED! -1 LIFE -1 AGI  "
  ELSE
    P-SCORE @ 20 + P-SCORE !
    SFX-STEP
    16 0 AT ." FLEE SUCCESSFUL! (+20 SCORE) "
  THEN
;

: DO-EXIT-LADDER ( -- )
  P-RX @ EXIT-X @ = P-RY @ EXIT-Y @ = AND IF
    P-GOLD @ P-BANKED @ + P-BANKED !
    P-SCORE @ P-GOLD @ P-FOR @ P-AGI @ P-INT @ + + + P-SCORE !
    0 P-GOLD !
    P-EXPED @ 1+ P-EXPED !
    SFX-WIN
    CLS
    2 0 AT ." === EXPEDITION COMPLETED! ==="
    4 0 AT ." TOTAL GOLD BANKED: " P-BANKED @ .
    5 0 AT ." CURRENT SCORE   : " P-SCORE @ .
    7 0 AT ." PREPARING NEXT LEVEL..."
    10000 0 DO LOOP
    GENERATE-MAZE
    CLS
    DRAW-FRAME
  THEN
;

( --- Character Creation & Game Init --- )
: INIT-GAME ( -- )
  RND-INIT
  INIT-GRAPHICS
  6 GRID-W !
  4 GRID-H !

  CLS
  0 0 AT ." === LES TRESORS DE ROM ==="
  2 0 AT ." WELCOME TO ROM DUNGEON!"
  4 0 AT ." CHARACTER CREATED:"
  6 0 AT ." AGILITY (AGI)     : 11"
  7 0 AT ." STRENGTH (FOR)    : 12"
  8 0 AT ." INTELLIGENCE (INT): 12"
  
  11 P-AGI ! 11 P-MAX-AGI !
  12 P-FOR ! 12 P-MAX-FOR !
  12 P-INT ! 12 P-MAX-INT !

  GRID-W @ GRID-H @ + 25 * DUP P-VP ! P-MAX-VP !
  0 P-GOLD !
  0 P-BANKED !
  0 P-SCORE !
  1 P-EXPED !

 10 0 AT ." INITIAL LIFE (VP)  : " P-VP @ .
 13 0 AT ." PRESS ANY KEY TO ENTER..."
 SFX-WIN
 KEY DROP

 CLS
 GENERATE-MAZE
 DRAW-FRAME
;

: SHOW-MONSTER ( room_type -- )
  DUP 1 = IF
    3 MON-HP !
    16 0 AT ." GOBLIN APPEARS!      "
  THEN
  DUP 2 = IF
    4 MON-HP !
    16 0 AT ." TROLL APPEARS!       "
  THEN
  DUP 3 = IF
    5 MON-HP !
    16 0 AT ." GHOUL APPEARS!       "
  THEN
  DUP 4 = IF
    6 MON-HP !
    16 0 AT ." LIZARDMAN ATTACKS!   "
  THEN
  DUP 5 = IF
    16 0 AT ." SAFE CHEST FOUND     "
  THEN
  DUP 6 = IF
    16 0 AT ." TRAPPED CHEST FOUND  "
  THEN
  DROP ;

: SHOW-ROOM-STATUS ( -- )
  P-RX @ P-RY @ GET-ROOM DUP 0> IF
    SHOW-MONSTER
    17 0 AT ." ACTIONS: [C]OMBAT [A]MAD"
    18 0 AT ."          [F]LEE   [O]PEN"
  ELSE
    DROP
    P-RX @ EXIT-X @ = P-RY @ EXIT-Y @ = AND IF
      16 0 AT ." YOU ARE AT LADDER!       "
      17 0 AT ." PRESS [E] TO EXIT LEVEL   "
    ELSE
      16 0 AT ." ROOM IS CLEAR.            "
      17 0 AT ." KEYS: [I,J,K,M] MOVE [P]  "
      18 0 AT ."       [H]EAL [Q]UIT         "
    THEN
  THEN ;

( --- Main Game Loop --- )
: PLAY ( -- )
  INIT-GAME
  BEGIN
    DRAW-ROOM
    DRAW-STATS
    CLEAR-LOG

    SHOW-ROOM-STATUS

    KEY TO-UPPER K-CODE !

    ( Key handling )
    K-CODE @ 73 = IF DO-MOVE-NORTH THEN
    K-CODE @ 77 = IF DO-MOVE-SOUTH THEN
    K-CODE @ 74 = IF DO-MOVE-WEST  THEN
    K-CODE @ 75 = IF DO-MOVE-EAST  THEN
    K-CODE @ 80 = IF DRAW-MAP      THEN
    K-CODE @ 72 = IF DO-HEAL       THEN
    K-CODE @ 79 = IF DO-CHEST      THEN
    K-CODE @ 67 = IF DO-COMBAT     THEN
    K-CODE @ 65 = IF DO-AMADOUER   THEN
    K-CODE @ 70 = IF DO-FLEE       THEN
    K-CODE @ 69 = IF DO-EXIT-LADDER THEN
    K-CODE @ 81 = IF 1 ELSE 0 THEN ( Q to quit )

    ( Check Death )
    P-VP @ ZLTE IF
      DROP 1
      SFX-DEAD
      CLS
      4 0 AT ." ========================"
      5 0 AT ."       GAME OVER        "
      6 0 AT ." YOU DIED IN THE DUNGEON "
      8 0 AT ." FINAL SCORE : " P-SCORE @ .
      9 0 AT ." GOLD BANKED : " P-BANKED @ .
     10 0 AT ." ========================"
    THEN
  UNTIL
  CLS
  0 0 AT ." THANKS FOR PLAYING ROM!" CR
;
