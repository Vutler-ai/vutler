-- Vutler Office Floorplan Generator
-- Aseprite Lua script — draws full office top-down pixel art
-- Resolution: 640x480 (4:3 ratio matching reference)

local W, H = 640, 480
local spr = Sprite(W, H)
spr.filename = "office-floorplan.png"
local cel = spr.cels[1]
local img = cel.image

-- ===== COLOR PALETTE =====
local C = {
  -- Backgrounds
  bg       = Color(30, 30, 45),      -- dark bg outside
  floor    = Color(156, 150, 130),   -- stone/tile floor
  floorAlt = Color(146, 140, 120),   -- alternate tile
  floorDk  = Color(130, 124, 108),   -- darker floor (shadows)
  
  -- Walls
  wallTop  = Color(220, 210, 185),   -- wall top edge (cream)
  wallFace = Color(190, 180, 160),   -- wall face
  wallDark = Color(140, 132, 118),   -- wall shadow
  wallLine = Color(100, 95, 85),     -- wall outline
  
  -- Doors
  door     = Color(80, 90, 120),     -- door frame
  doorFill = Color(60, 65, 85),      -- door opening
  
  -- Furniture: Desks
  deskTop  = Color(160, 120, 70),    -- wood desk top
  deskSide = Color(130, 95, 55),     -- wood desk side
  deskDark = Color(100, 75, 45),     -- wood desk shadow
  
  -- Monitors
  monFrame = Color(40, 45, 55),      -- monitor frame
  monScr   = Color(50, 140, 180),    -- monitor screen blue
  monScrG  = Color(50, 170, 100),    -- monitor screen green
  monScrO  = Color(180, 130, 50),    -- monitor screen orange
  monGlow  = Color(80, 200, 220),    -- screen glow
  
  -- Chairs
  chairSeat = Color(50, 55, 70),     -- chair seat (dark blue-gray)
  chairBack = Color(40, 44, 58),     -- chair back
  chairArm  = Color(60, 65, 80),     -- chair armrest
  
  -- Conference table
  confTable = Color(170, 110, 60),   -- conference table wood
  confDark  = Color(130, 85, 45),    -- table dark side
  confChair = Color(55, 60, 75),     -- conference chairs
  
  -- Plants
  potBrown = Color(140, 90, 50),     -- pot
  leafGrn  = Color(50, 160, 70),     -- leaf green
  leafDk   = Color(35, 120, 50),     -- leaf dark
  
  -- Server racks
  rackBody = Color(45, 50, 60),      -- rack body
  rackFace = Color(55, 60, 72),      -- rack face
  rackLED  = Color(50, 200, 80),     -- LED green
  rackLEDR = Color(200, 60, 60),     -- LED red
  rackLEDB = Color(60, 120, 220),    -- LED blue
  rackCable= Color(180, 50, 50),     -- cable red
  
  -- Lounge
  sofaBrown = Color(120, 80, 50),    -- sofa leather
  sofaDark  = Color(90, 60, 38),     -- sofa shadow
  sofaLight = Color(145, 100, 65),   -- sofa highlight
  ppTable   = Color(45, 130, 100),   -- ping pong table
  ppNet     = Color(200, 200, 200),  -- ping pong net
  ppLegs   = Color(80, 80, 80),     -- table legs
  vendBody = Color(50, 55, 68),      -- vending machine
  vendGlass= Color(70, 140, 180),    -- vending glass
  vendRed  = Color(180, 50, 50),     -- vending red accent
  
  -- Coffee machine
  coffBody = Color(60, 60, 65),      -- coffee body
  coffAccent=Color(180, 50, 50),     -- coffee red accent
  
  -- Whiteboard
  wbFrame  = Color(120, 120, 130),   -- whiteboard frame
  wbFill   = Color(230, 230, 235),   -- whiteboard white
  wbMarker = Color(200, 60, 60),     -- marker line red
  wbMarkerB= Color(50, 100, 200),    -- marker line blue
  
  -- War room
  bigScreen = Color(25, 35, 55),     -- big screen bg
  mapGreen  = Color(40, 120, 80),    -- map land
  mapBlue   = Color(30, 60, 100),    -- map water
  mapGlow   = Color(60, 180, 140),   -- map glow
  
  -- Bookshelf
  shelfWood = Color(130, 90, 55),    -- shelf wood
  book1     = Color(180, 50, 50),    -- book red
  book2     = Color(50, 100, 180),   -- book blue
  book3     = Color(50, 160, 80),    -- book green
  book4     = Color(200, 180, 60),   -- book yellow
  
  -- Misc
  black    = Color(0, 0, 0),
  white    = Color(255, 255, 255),
  shadow   = Color(0, 0, 0, 80),
}

-- ===== DRAWING HELPERS =====
local function rect(x, y, w, h, color)
  for dy = 0, h-1 do
    for dx = 0, w-1 do
      local px, py = x+dx, y+dy
      if px >= 0 and px < W and py >= 0 and py < H then
        img:drawPixel(px, py, color)
      end
    end
  end
end

local function pixel(x, y, color)
  if x >= 0 and x < W and y >= 0 and y < H then
    img:drawPixel(x, y, color)
  end
end

local function hline(x, y, w, color)
  for dx = 0, w-1 do pixel(x+dx, y, color) end
end

local function vline(x, y, h, color)
  for dy = 0, h-1 do pixel(x, y+dy, color) end
end

-- Tiled floor pattern
local function tileFloor(x, y, w, h, tileSize)
  tileSize = tileSize or 8
  for dy = 0, h-1 do
    for dx = 0, w-1 do
      local tx = math.floor(dx / tileSize)
      local ty = math.floor(dy / tileSize)
      local isEdge = (dx % tileSize == 0) or (dy % tileSize == 0)
      local color
      if isEdge then
        color = C.floorDk
      elseif (tx + ty) % 2 == 0 then
        color = C.floor
      else
        color = C.floorAlt
      end
      pixel(x+dx, y+dy, color)
    end
  end
end

-- Wall (horizontal, top edge visible)
local function wallH(x, y, w, thickness)
  thickness = thickness or 6
  rect(x, y, w, 1, C.wallLine)
  rect(x, y+1, w, 2, C.wallTop)
  rect(x, y+3, w, thickness-4, C.wallFace)
  rect(x, y+thickness-1, w, 1, C.wallDark)
end

-- Wall (vertical, left edge visible)
local function wallV(x, y, h, thickness)
  thickness = thickness or 6
  vline(x, y, h, C.wallLine)
  rect(x+1, y, 2, h, C.wallTop)
  rect(x+3, y, thickness-4, h, C.wallFace)
  vline(x+thickness-1, y, h, C.wallDark)
end

-- Door opening in horizontal wall
local function doorH(x, y, w)
  rect(x, y, w, 6, C.doorFill)
  rect(x, y, 2, 6, C.door)
  rect(x+w-2, y, 2, 6, C.door)
end

-- Door opening in vertical wall
local function doorV(x, y, h)
  rect(x, y, 6, h, C.doorFill)
  rect(x, y, 6, 2, C.door)
  rect(x, y+h-2, 6, 2, C.door)
end

-- ===== FURNITURE FUNCTIONS =====

-- Desk with dual monitors (top-down, ~30x18)
local function deskDual(x, y)
  -- Desk surface
  rect(x, y+6, 30, 12, C.deskTop)
  rect(x, y+16, 30, 2, C.deskSide)
  hline(x, y+6, 30, C.deskDark)
  -- Monitor 1
  rect(x+2, y, 12, 7, C.monFrame)
  rect(x+3, y+1, 10, 5, C.monScr)
  -- Monitor 2
  rect(x+16, y, 12, 7, C.monFrame)
  rect(x+17, y+1, 10, 5, C.monScrG)
  -- Keyboard
  rect(x+8, y+9, 14, 3, C.chairSeat)
  -- Mouse
  rect(x+24, y+10, 3, 2, C.chairSeat)
end

-- Single monitor desk (~20x14)
local function deskSingle(x, y)
  rect(x, y+5, 20, 9, C.deskTop)
  rect(x, y+12, 20, 2, C.deskSide)
  hline(x, y+5, 20, C.deskDark)
  rect(x+4, y, 12, 6, C.monFrame)
  rect(x+5, y+1, 10, 4, C.monScrO)
  rect(x+5, y+7, 10, 2, C.chairSeat)
end

-- Manager desk (bigger, ~36x20)
local function deskManager(x, y)
  rect(x, y+6, 36, 14, C.deskTop)
  rect(x, y+18, 36, 2, C.deskSide)
  hline(x, y+6, 36, C.deskDark)
  -- Main monitor
  rect(x+12, y, 12, 7, C.monFrame)
  rect(x+13, y+1, 10, 5, C.monScr)
  -- Side items
  rect(x+2, y+8, 6, 4, C.leafGrn)  -- plant on desk
  rect(x+28, y+8, 5, 3, C.wbFill)   -- papers
end

-- Office chair (top-down, ~10x10)
local function chair(x, y)
  rect(x+2, y, 6, 3, C.chairBack)
  rect(x+1, y+3, 8, 6, C.chairSeat)
  rect(x, y+4, 1, 4, C.chairArm)
  rect(x+9, y+4, 1, 4, C.chairArm)
  -- Wheels
  pixel(x+1, y+9, C.chairArm)
  pixel(x+8, y+9, C.chairArm)
end

-- Conference table (~50x24)
local function confTableDraw(x, y)
  rect(x, y, 50, 24, C.confTable)
  rect(x+1, y+1, 48, 22, C.confDark)
  rect(x+2, y+2, 46, 20, C.confTable)
  -- Center line
  hline(x+5, y+12, 40, C.confDark)
  -- Chairs around table (8 chairs)
  for i = 0, 3 do
    rect(x+4+i*12, y-4, 6, 4, C.confChair)  -- top
    rect(x+4+i*12, y+24, 6, 4, C.confChair) -- bottom
  end
end

-- Plant (~10x14)
local function plant(x, y)
  rect(x+2, y+8, 6, 6, C.potBrown)
  rect(x+3, y+7, 4, 1, C.potBrown)
  -- Leaves
  rect(x+1, y+2, 8, 6, C.leafGrn)
  rect(x, y+3, 2, 3, C.leafDk)
  rect(x+8, y+4, 2, 2, C.leafDk)
  rect(x+3, y, 4, 3, C.leafGrn)
  pixel(x+4, y, C.leafDk)
end

-- Server rack (~12x28)
local function serverRack(x, y)
  rect(x, y, 12, 28, C.rackBody)
  rect(x+1, y+1, 10, 26, C.rackFace)
  -- Panels (4 slots)
  for i = 0, 3 do
    local py = y + 2 + i * 6
    rect(x+2, py, 8, 5, C.rackBody)
    -- LEDs
    for j = 0, 2 do
      local colors = {C.rackLED, C.rackLEDR, C.rackLEDB}
      pixel(x+3+j*2, py+1, colors[(i+j)%3 + 1])
      pixel(x+3+j*2, py+3, colors[(i+j+1)%3 + 1])
    end
  end
  -- Cables at bottom
  rect(x+3, y+26, 2, 2, C.rackCable)
  rect(x+7, y+26, 2, 2, C.rackLEDB)
end

-- Sofa (~28x14)
local function sofa(x, y)
  rect(x, y, 28, 14, C.sofaBrown)
  rect(x+1, y+1, 26, 12, C.sofaLight)
  rect(x+2, y+2, 24, 10, C.sofaBrown)
  -- Cushions
  rect(x+3, y+3, 10, 8, C.sofaLight)
  rect(x+15, y+3, 10, 8, C.sofaLight)
  -- Armrests
  rect(x, y, 2, 14, C.sofaDark)
  rect(x+26, y, 2, 14, C.sofaDark)
end

-- Ping pong table (~36x18)
local function pingpong(x, y)
  rect(x, y, 36, 18, C.ppTable)
  rect(x+1, y+1, 34, 16, Color(55, 145, 110))
  -- Net
  rect(x+17, y, 2, 18, C.ppNet)
  -- Lines
  hline(x+2, y+1, 14, C.white)
  hline(x+20, y+1, 14, C.white)
  hline(x+2, y+16, 14, C.white)
  hline(x+20, y+16, 14, C.white)
  -- Legs
  rect(x+2, y+17, 3, 2, C.ppLegs)
  rect(x+31, y+17, 3, 2, C.ppLegs)
end

-- Vending machine (~14x20)
local function vendingMachine(x, y)
  rect(x, y, 14, 20, C.vendBody)
  rect(x+1, y+1, 12, 12, C.vendGlass)
  -- Shelves
  for i = 0, 2 do
    hline(x+2, y+3+i*4, 10, C.vendBody)
    for j = 0, 3 do
      local colors = {C.vendRed, C.leafGrn, C.book4, C.monScr}
      rect(x+2+j*3, y+1+i*4, 2, 2, colors[j+1])
    end
  end
  -- Bottom panel
  rect(x+1, y+14, 12, 5, C.rackBody)
  rect(x+4, y+15, 6, 3, C.vendRed)
end

-- Coffee machine (~12x16)
local function coffeeMachine(x, y)
  rect(x, y, 12, 16, C.coffBody)
  rect(x+1, y+1, 10, 8, C.rackFace)
  rect(x+3, y+3, 6, 4, C.coffAccent)
  rect(x+2, y+10, 8, 4, C.rackBody)
  pixel(x+5, y+11, C.rackLED)
end

-- Whiteboard (~24x16)
local function whiteboard(x, y)
  rect(x, y, 24, 16, C.wbFrame)
  rect(x+1, y+1, 22, 14, C.wbFill)
  -- Scribbles
  for i = 0, 4 do
    hline(x+3, y+3+i*2, 8+math.floor(i*1.5), (i%2==0) and C.wbMarker or C.wbMarkerB)
  end
  -- Marker tray
  rect(x+2, y+14, 20, 1, C.wbFrame)
end

-- Big screen with world map (~52x28)
local function bigScreenMap(x, y)
  rect(x, y, 52, 28, C.monFrame)
  rect(x+1, y+1, 50, 26, C.bigScreen)
  -- Water (base)
  rect(x+2, y+2, 48, 24, C.mapBlue)
  -- Simplified continents
  -- North America
  rect(x+6, y+4, 10, 6, C.mapGreen)
  rect(x+8, y+10, 6, 3, C.mapGreen)
  -- South America
  rect(x+12, y+14, 5, 8, C.mapGreen)
  rect(x+11, y+13, 4, 3, C.mapGreen)
  -- Europe
  rect(x+22, y+4, 6, 5, C.mapGreen)
  -- Africa
  rect(x+22, y+10, 8, 10, C.mapGreen)
  rect(x+24, y+20, 4, 4, C.mapGreen)
  -- Asia
  rect(x+30, y+3, 14, 8, C.mapGreen)
  rect(x+32, y+11, 8, 4, C.mapGreen)
  -- Australia
  rect(x+40, y+16, 6, 4, C.mapGreen)
  -- Glow dots (cities)
  pixel(x+10, y+6, C.mapGlow)
  pixel(x+24, y+6, C.mapGlow)  -- Geneva!
  pixel(x+34, y+5, C.mapGlow)
  pixel(x+42, y+18, C.mapGlow)
  -- Screen border glow
  hline(x+2, y+2, 48, Color(40, 80, 120))
end

-- Bookshelf (~16x20)
local function bookshelf(x, y)
  rect(x, y, 16, 20, C.shelfWood)
  rect(x+1, y+1, 14, 18, Color(110, 75, 45))
  -- Shelves
  for row = 0, 2 do
    local sy = y + 2 + row * 6
    rect(x+1, sy+5, 14, 1, C.shelfWood)
    -- Books
    for b = 0, 5 do
      local colors = {C.book1, C.book2, C.book3, C.book4, C.book1, C.book2}
      local bh = 3 + (b % 2)
      rect(x+2+b*2, sy+(5-bh), 2, bh, colors[b+1])
    end
  end
end

-- ===== DRAW THE OFFICE =====

-- Background
rect(0, 0, W, H, C.bg)

-- Layout constants (all in pixels, matching reference proportions)
-- Top row: 3 rooms side by side
-- Bottom row: 3 rooms
-- Hallway in between

local MARGIN = 12       -- outer margin
local WALL = 6          -- wall thickness
local HALL_H = 24       -- hallway height
local TOP_H = 190       -- top rooms height
local BOT_H = 190       -- bottom rooms height
local TOP_Y = MARGIN
local HALL_Y = TOP_Y + TOP_H
local BOT_Y = HALL_Y + HALL_H
local INNER_W = W - 2*MARGIN

-- Room widths (approximate reference proportions)
local ENG_W = math.floor(INNER_W * 0.42)    -- Engineering (left, wider)
local CONF_W = math.floor(INNER_W * 0.25)   -- Conference (center)
local OPS_W = INNER_W - ENG_W - CONF_W      -- Ops (right)

local LOUNGE_W = math.floor(INNER_W * 0.38) -- Break room
local WAR_W = math.floor(INNER_W * 0.40)    -- War room
local SRV_W = INNER_W - LOUNGE_W - WAR_W    -- Server room

-- ===== TOP ROW =====

-- Engineering Lab floor + walls
tileFloor(MARGIN, TOP_Y, ENG_W, TOP_H, 8)
wallH(MARGIN, TOP_Y, ENG_W, WALL)
wallV(MARGIN, TOP_Y, TOP_H, WALL)
wallH(MARGIN, TOP_Y+TOP_H-WALL, ENG_W, WALL)
wallV(MARGIN+ENG_W-WALL, TOP_Y, TOP_H, WALL)
-- Door to hallway
doorH(MARGIN+ENG_W/2-10, TOP_Y+TOP_H-WALL, 20)

-- Conference Room
local confX = MARGIN + ENG_W
tileFloor(confX, TOP_Y, CONF_W, TOP_H, 8)
wallH(confX, TOP_Y, CONF_W, WALL)
wallH(confX, TOP_Y+TOP_H-WALL, CONF_W, WALL)
wallV(confX, TOP_Y, TOP_H, WALL)
wallV(confX+CONF_W-WALL, TOP_Y, TOP_H, WALL)
doorH(confX+CONF_W/2-10, TOP_Y+TOP_H-WALL, 20)

-- Ops Center
local opsX = confX + CONF_W
tileFloor(opsX, TOP_Y, OPS_W, TOP_H, 8)
wallH(opsX, TOP_Y, OPS_W, WALL)
wallV(opsX, TOP_Y, TOP_H, WALL)
wallH(opsX, TOP_Y+TOP_H-WALL, OPS_W, WALL)
wallV(opsX+OPS_W-WALL, TOP_Y, TOP_H, WALL)
doorH(opsX+OPS_W/2-10, TOP_Y+TOP_H-WALL, 20)

-- ===== HALLWAY =====
tileFloor(MARGIN, HALL_Y, INNER_W, HALL_H, 10)
wallH(MARGIN, HALL_Y, INNER_W, 3)
wallH(MARGIN, HALL_Y+HALL_H-3, INNER_W, 3)
-- Hallway lights
for i = 0, 5 do
  pixel(MARGIN + 50 + i*90, HALL_Y + HALL_H/2, C.white)
  pixel(MARGIN + 50 + i*90 + 1, HALL_Y + HALL_H/2, Color(200, 200, 180))
end

-- ===== BOTTOM ROW =====

-- Break Room / Lounge
tileFloor(MARGIN, BOT_Y, LOUNGE_W, BOT_H, 8)
wallH(MARGIN, BOT_Y, LOUNGE_W, WALL)
wallV(MARGIN, BOT_Y, BOT_H, WALL)
wallH(MARGIN, BOT_Y+BOT_H-WALL, LOUNGE_W, WALL)
wallV(MARGIN+LOUNGE_W-WALL, BOT_Y, BOT_H, WALL)
doorH(MARGIN+LOUNGE_W/2-10, BOT_Y, 20)

-- War Room
local warX = MARGIN + LOUNGE_W
tileFloor(warX, BOT_Y, WAR_W, BOT_H, 8)
wallH(warX, BOT_Y, WAR_W, WALL)
wallV(warX, BOT_Y, BOT_H, WALL)
wallH(warX, BOT_Y+BOT_H-WALL, WAR_W, WALL)
wallV(warX+WAR_W-WALL, BOT_Y, BOT_H, WALL)
doorH(warX+WAR_W/2-10, BOT_Y, 20)

-- Server Room
local srvX = warX + WAR_W
tileFloor(srvX, BOT_Y, SRV_W, BOT_H, 8)
wallH(srvX, BOT_Y, SRV_W, WALL)
wallV(srvX, BOT_Y, BOT_H, WALL)
wallH(srvX, BOT_Y+BOT_H-WALL, SRV_W, WALL)
wallV(srvX+SRV_W-WALL, BOT_Y, BOT_H, WALL)
doorH(srvX+SRV_W/2-8, BOT_Y, 16)

-- ===== FURNITURE: ENGINEERING LAB =====
local ex, ey = MARGIN + WALL + 4, TOP_Y + WALL + 4

-- 3 dual-monitor workstations (left column)
deskDual(ex + 4, ey + 6)
chair(ex + 14, ey + 28)
deskDual(ex + 4, ey + 50)
chair(ex + 14, ey + 72)
deskDual(ex + 4, ey + 94)
chair(ex + 14, ey + 116)

-- Manager desk (upper right of engineering)
deskManager(ex + 100, ey + 10)
chair(ex + 115, ey + 34)

-- Plant
plant(ex + 85, ey + 5)
plant(ex + 140, ey + 5)

-- Whiteboard
whiteboard(ex + 100, ey + 60)

-- Bookshelf
bookshelf(ex + 130, ey + 90)

-- Small server closet (center-right of engineering)
serverRack(ex + 140, ey + 130)

-- ===== FURNITURE: CONFERENCE ROOM =====
local cx, cy = confX + WALL + 4, TOP_Y + WALL + 4

-- Big conference table centered
confTableDraw(cx + (CONF_W - WALL*2 - 58)/2, cy + 50)

-- Whiteboard on top wall
whiteboard(cx + (CONF_W - WALL*2 - 32)/2, cy + 4)

-- Plants in corners
plant(cx + 2, cy + 2)
plant(cx + CONF_W - WALL*2 - 18, cy + 2)

-- ===== FURNITURE: OPS CENTER =====
local ox, oy = opsX + WALL + 4, TOP_Y + WALL + 4

-- Left column of desks (3)
deskDual(ox + 4, oy + 6)
chair(ox + 14, oy + 28)
deskDual(ox + 4, oy + 50)
chair(ox + 14, oy + 72)
deskDual(ox + 4, oy + 94)
chair(ox + 14, oy + 116)

-- Right column of desks (2)
deskDual(ox + OPS_W - WALL*2 - 40, oy + 6)
chair(ox + OPS_W - WALL*2 - 30, oy + 28)
deskDual(ox + OPS_W - WALL*2 - 40, oy + 50)
chair(ox + OPS_W - WALL*2 - 30, oy + 72)

-- ===== FURNITURE: BREAK ROOM / LOUNGE =====
local lx, ly = MARGIN + WALL + 4, BOT_Y + WALL + 4

-- Vending machines (top-left)
vendingMachine(lx + 4, ly + 4)
vendingMachine(lx + 22, ly + 4)
coffeeMachine(lx + 40, ly + 4)

-- Plant
plant(lx + 60, ly + 4)

-- Desks for casual work
deskSingle(lx + 80, ly + 4)

-- Ping pong (center)
pingpong(lx + 50, ly + 65)

-- Sofas (bottom area)
sofa(lx + 4, ly + 110)
sofa(lx + 50, ly + 110)

-- Bookshelf
bookshelf(lx + 100, ly + 50)

-- ===== FURNITURE: WAR ROOM =====
local wx, wy = warX + WALL + 4, BOT_Y + WALL + 4

-- Big screen on top wall
bigScreenMap(wx + (WAR_W - WALL*2 - 60)/2, wy + 4)

-- Command desks below screen
deskDual(wx + 10, wy + 80)
chair(wx + 20, wy + 102)
deskDual(wx + 50, wy + 80)
chair(wx + 60, wy + 102)
deskDual(wx + 90, wy + 80)
chair(wx + 100, wy + 102)

-- Side monitors
deskSingle(wx + 10, wy + 130)
deskSingle(wx + 90, wy + 130)

-- ===== FURNITURE: SERVER ROOM =====
local sx, sy = srvX + WALL + 4, BOT_Y + WALL + 4

-- 4 server racks (2 columns)
serverRack(sx + 4, sy + 4)
serverRack(sx + 20, sy + 4)
serverRack(sx + 4, sy + 40)
serverRack(sx + 20, sy + 40)

-- More racks
serverRack(sx + 4, sy + 80)
serverRack(sx + 20, sy + 80)

-- Cables on floor
for i = 0, 15 do
  pixel(sx + 10 + i, sy + 120 + math.floor(math.sin(i*0.5)*2), C.rackCable)
  pixel(sx + 5 + i, sy + 125 + math.floor(math.sin(i*0.7)*2), C.rackLEDB)
end

-- ===== ROOM LABELS (small text-like indicators) =====
-- We'll use colored dots as room indicators since we can't render text easily

-- Engineering: cyan dot
rect(MARGIN + 8, TOP_Y + 8, 3, 3, C.monScr)
-- Conference: yellow dot
rect(confX + 8, TOP_Y + 8, 3, 3, C.book4)
-- Ops: purple dot
rect(opsX + 8, TOP_Y + 8, 3, 3, Color(130, 100, 220))
-- Lounge: green dot
rect(MARGIN + 8, BOT_Y + 8, 3, 3, C.leafGrn)
-- War Room: orange dot
rect(warX + 8, BOT_Y + 8, 3, 3, C.monScrO)
-- Server: red dot
rect(srvX + 8, BOT_Y + 8, 3, 3, C.rackLEDR)

-- ===== OUTER FRAME =====
-- Thin border around entire office
hline(MARGIN-2, TOP_Y-2, INNER_W+4, C.wallLine)
hline(MARGIN-2, BOT_Y+BOT_H+1, INNER_W+4, C.wallLine)
vline(MARGIN-2, TOP_Y-2, BOT_Y+BOT_H-TOP_Y+4, C.wallLine)
vline(MARGIN+INNER_W+1, TOP_Y-2, BOT_Y+BOT_H-TOP_Y+4, C.wallLine)

-- Save
spr:saveAs("/Users/lopez/.openclaw/workspace/projects/vutler/sprites/office-floorplan-drawn.png")
print("✅ Office floorplan drawn: 640x480, 6 rooms, full furniture")
