-- Generate all 13 agent sprites + furniture for Pixel Office
local OUT = "/Users/lopez/.openclaw/workspace/projects/vutler/sprites/"

-- Agent definitions: name, shirt color, hair color, accessory
local agents = {
  { name="jarvis",   shirt={124,124,255}, hair={40,40,60},   skin={255,213,170} },
  { name="andrea",   shirt={244,114,182}, hair={139,69,19},  skin={210,180,140} },
  { name="mike",     shirt={34,211,238},  hair={20,20,20},   skin={255,213,170} },
  { name="philip",   shirt={167,139,250}, hair={180,140,60}, skin={255,213,170} },
  { name="luna",     shirt={251,191,36},  hair={30,30,30},   skin={210,180,140} },
  { name="max",      shirt={52,211,153},  hair={200,60,60},  skin={255,213,170} },
  { name="victor",   shirt={251,191,36},  hair={50,30,20},   skin={139,119,101} },
  { name="oscar",    shirt={251,146,60},  hair={220,180,100},skin={255,213,170} },
  { name="nora",     shirt={248,113,113}, hair={60,20,60},   skin={210,180,140} },
  { name="stephen",  shirt={192,132,252}, hair={20,20,20},   skin={139,119,101} },
  { name="sentinel", shirt={56,189,248},  hair={100,100,120},skin={200,200,210} },
  { name="marcus",   shirt={74,222,128},  hair={40,40,40},   skin={139,119,101} },
  { name="rex",      shirt={244,63,94},   hair={60,60,60},   skin={200,200,210} },
}

local function c(r,g,b) return Color(r,g,b) end

local function drawAgent(img, a)
  local skin = c(a.skin[1], a.skin[2], a.skin[3])
  local hair = c(a.hair[1], a.hair[2], a.hair[3])
  local shirt = c(a.shirt[1], a.shirt[2], a.shirt[3])
  local pants = c(55, 65, 81)
  local shoes = c(30, 30, 30)
  local eye = c(20, 20, 20)
  local mouth = c(200, 100, 100)

  -- Shadow
  local shadow = Color(0, 0, 0, 40)
  for x = 4, 12 do img:drawPixel(x, 15, shadow) end

  -- Hair top
  for x = 5, 10 do img:drawPixel(x, 1, hair) end
  for x = 4, 11 do img:drawPixel(x, 2, hair) end
  for x = 4, 11 do img:drawPixel(x, 3, hair) end

  -- Face
  for y = 4, 7 do
    for x = 5, 10 do img:drawPixel(x, y, skin) end
  end
  -- Hair sides
  img:drawPixel(4, 4, hair); img:drawPixel(11, 4, hair)
  img:drawPixel(4, 5, hair); img:drawPixel(11, 5, hair)

  -- Eyes
  img:drawPixel(6, 5, eye); img:drawPixel(9, 5, eye)
  -- Mouth
  img:drawPixel(7, 7, mouth); img:drawPixel(8, 7, mouth)

  -- Neck
  img:drawPixel(7, 8, skin); img:drawPixel(8, 8, skin)

  -- Shirt body
  for y = 9, 11 do
    for x = 4, 11 do img:drawPixel(x, y, shirt) end
  end
  -- Arms
  for y = 9, 11 do
    img:drawPixel(3, y, skin); img:drawPixel(12, y, skin)
  end
  -- Hands
  img:drawPixel(3, 12, skin); img:drawPixel(12, 12, skin)

  -- Pants
  for y = 12, 13 do
    for x = 5, 7 do img:drawPixel(x, y, pants) end
    for x = 9, 11 do img:drawPixel(x, y, pants) end
  end

  -- Shoes
  for x = 4, 7 do img:drawPixel(x, 14, shoes) end
  for x = 9, 12 do img:drawPixel(x, 14, shoes) end
end

-- Generate each agent
for _, a in ipairs(agents) do
  local sprite = Sprite(16, 16, ColorMode.RGB)
  local img = sprite.cels[1].image
  drawAgent(img, a)
  sprite:saveCopyAs(OUT .. "agent-" .. a.name .. ".png")
  sprite:close()
end

-- ============ FURNITURE ============

-- Desk (24x16)
local function makeFurniture(w, h, name, drawFn)
  local sp = Sprite(w, h, ColorMode.RGB)
  local img = sp.cels[1].image
  drawFn(img, w, h)
  sp:saveCopyAs(OUT .. name .. ".png")
  sp:close()
end

-- Desk
makeFurniture(24, 12, "desk", function(img, w, h)
  local wood = c(101, 67, 33)
  local top = c(139, 90, 43)
  local screen = c(40, 40, 60)
  local screenGlow = c(80, 120, 200)
  -- Desk surface
  for x = 0, w-1 do
    for y = 4, 7 do img:drawPixel(x, y, top) end
  end
  for x = 0, w-1 do img:drawPixel(x, 3, wood) end
  -- Legs
  for y = 8, h-1 do
    img:drawPixel(1, y, wood); img:drawPixel(w-2, y, wood)
  end
  -- Monitor
  for x = 8, 15 do
    for y = 0, 3 do img:drawPixel(x, y, screen) end
  end
  for x = 9, 14 do
    for y = 1, 2 do img:drawPixel(x, y, screenGlow) end
  end
  img:drawPixel(11, 4, c(80,80,80)); img:drawPixel(12, 4, c(80,80,80))
end)

-- Chair
makeFurniture(12, 16, "chair", function(img, w, h)
  local frame = c(50, 50, 50)
  local seat = c(80, 80, 90)
  local back = c(60, 60, 70)
  -- Back rest
  for x = 2, 9 do
    for y = 0, 5 do img:drawPixel(x, y, back) end
  end
  -- Seat
  for x = 1, 10 do
    for y = 6, 9 do img:drawPixel(x, y, seat) end
  end
  -- Legs/wheels
  img:drawPixel(3, 10, frame); img:drawPixel(8, 10, frame)
  img:drawPixel(2, 11, frame); img:drawPixel(9, 11, frame)
  for y = 12, 14 do
    img:drawPixel(5, y, frame); img:drawPixel(6, y, frame)
  end
  img:drawPixel(1, 15, frame); img:drawPixel(10, 15, frame)
  img:drawPixel(5, 15, frame); img:drawPixel(6, 15, frame)
end)

-- Server rack
makeFurniture(12, 24, "server-rack", function(img, w, h)
  local metal = c(60, 60, 70)
  local dark = c(30, 30, 35)
  local led_g = c(0, 255, 0)
  local led_r = c(255, 0, 0)
  local led_b = c(0, 100, 255)
  -- Rack frame
  for x = 0, w-1 do
    for y = 0, h-1 do img:drawPixel(x, y, metal) end
  end
  -- Rack units (6 units)
  for u = 0, 5 do
    local uy = u * 4
    for x = 1, w-2 do
      for y = uy, uy+3 do img:drawPixel(x, y, dark) end
    end
    -- LEDs
    img:drawPixel(2, uy+1, led_g)
    img:drawPixel(4, uy+1, (u % 2 == 0) and led_b or led_g)
    img:drawPixel(6, uy+1, (u == 3) and led_r or led_g)
    -- Vents
    for x = 2, w-3 do img:drawPixel(x, uy+3, c(40,40,45)) end
  end
end)

-- Coffee machine
makeFurniture(12, 14, "coffee-machine", function(img, w, h)
  local body = c(80, 80, 85)
  local dark = c(40, 40, 45)
  local accent = c(200, 100, 50)
  local cup = c(255, 255, 255)
  -- Body
  for x = 1, 10 do
    for y = 0, 9 do img:drawPixel(x, y, body) end
  end
  -- Display
  for x = 3, 8 do
    for y = 1, 3 do img:drawPixel(x, y, dark) end
  end
  img:drawPixel(4, 2, c(0,200,0))
  -- Spout
  for y = 5, 7 do img:drawPixel(5, y, dark); img:drawPixel(6, y, dark) end
  -- Cup
  for x = 4, 7 do img:drawPixel(x, 10, cup) end
  for y = 10, 12 do img:drawPixel(4, y, cup); img:drawPixel(7, y, cup) end
  for x = 4, 7 do img:drawPixel(x, 12, cup) end
  -- Coffee inside
  img:drawPixel(5, 11, accent); img:drawPixel(6, 11, accent)
  -- Base
  for x = 0, 11 do img:drawPixel(x, 13, dark) end
end)

-- Ping pong table
makeFurniture(32, 16, "pingpong", function(img, w, h)
  local green = c(0, 120, 60)
  local white = c(255, 255, 255)
  local leg = c(80, 80, 80)
  -- Table top
  for x = 0, w-1 do
    for y = 2, 9 do img:drawPixel(x, y, green) end
  end
  -- Center line
  for y = 2, 9 do img:drawPixel(15, y, white); img:drawPixel(16, y, white) end
  -- Net
  for x = 14, 17 do img:drawPixel(x, 1, white) end
  img:drawPixel(15, 0, white); img:drawPixel(16, 0, white)
  -- Edge lines
  for x = 0, w-1 do img:drawPixel(x, 2, white); img:drawPixel(x, 9, white) end
  for y = 2, 9 do img:drawPixel(0, y, white); img:drawPixel(w-1, y, white) end
  -- Legs
  for y = 10, 14 do
    img:drawPixel(2, y, leg); img:drawPixel(w-3, y, leg)
    img:drawPixel(14, y, leg); img:drawPixel(17, y, leg)
  end
end)

-- Conference table
makeFurniture(48, 20, "conference-table", function(img, w, h)
  local wood = c(101, 67, 33)
  local top = c(160, 110, 60)
  -- Table top (oval-ish)
  for x = 4, w-5 do
    for y = 4, 11 do img:drawPixel(x, y, top) end
  end
  for x = 2, w-3 do
    for y = 6, 9 do img:drawPixel(x, y, top) end
  end
  -- Edge
  for x = 4, w-5 do img:drawPixel(x, 4, wood); img:drawPixel(x, 11, wood) end
  for y = 6, 9 do img:drawPixel(2, y, wood); img:drawPixel(w-3, y, wood) end
  -- Legs
  local leg = c(80, 60, 30)
  for y = 12, 18 do
    img:drawPixel(8, y, leg); img:drawPixel(w-9, y, leg)
  end
end)

-- Sofa
makeFurniture(24, 14, "sofa", function(img, w, h)
  local fabric = c(70, 70, 120)
  local dark = c(50, 50, 90)
  local arm = c(60, 60, 100)
  -- Back
  for x = 2, w-3 do
    for y = 0, 4 do img:drawPixel(x, y, dark) end
  end
  -- Seat
  for x = 2, w-3 do
    for y = 5, 9 do img:drawPixel(x, y, fabric) end
  end
  -- Arms
  for y = 2, 9 do
    img:drawPixel(0, y, arm); img:drawPixel(1, y, arm)
    img:drawPixel(w-2, y, arm); img:drawPixel(w-1, y, arm)
  end
  -- Legs
  img:drawPixel(3, 10, c(40,40,40)); img:drawPixel(w-4, 10, c(40,40,40))
  -- Cushion lines
  for y = 6, 8 do
    img:drawPixel(8, y, dark); img:drawPixel(15, y, dark)
  end
end)

-- Plant
makeFurniture(10, 16, "plant", function(img, w, h)
  local pot = c(180, 100, 60)
  local soil = c(80, 50, 30)
  local leaf = c(34, 180, 80)
  local dark_leaf = c(20, 120, 50)
  -- Pot
  for x = 2, 7 do
    for y = 10, 15 do img:drawPixel(x, y, pot) end
  end
  for x = 1, 8 do img:drawPixel(x, 10, pot) end
  for x = 2, 7 do img:drawPixel(x, 10, soil) end
  -- Leaves
  local leaves = {
    {4,9},{5,9},{3,8},{6,8},{4,7},{5,7},{2,6},{7,6},
    {3,5},{6,5},{4,4},{5,4},{1,5},{8,5},{3,3},{6,3},
    {4,2},{5,2},{5,1}
  }
  for _, p in ipairs(leaves) do
    img:drawPixel(p[1], p[2], (p[1]+p[2]) % 2 == 0 and leaf or dark_leaf)
  end
end)

print("All sprites generated!")
