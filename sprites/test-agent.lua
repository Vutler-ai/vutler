-- Test: create a simple 16x16 agent sprite
local sprite = Sprite(16, 16, ColorMode.RGB)
sprite.filename = "test-agent.png"

local cel = sprite.cels[1]
local img = cel.image

-- Draw a simple character
-- Head (skin color)
local skin = Color(255, 213, 170)
local hair = Color(60, 40, 30)
local shirt = Color(59, 130, 246) -- blue
local pants = Color(55, 65, 81)
local shoes = Color(30, 30, 30)
local eye = Color(0, 0, 0)

-- Hair (row 2-3)
for x = 5, 10 do img:drawPixel(x, 2, hair) end
for x = 4, 11 do img:drawPixel(x, 3, hair) end

-- Face (row 4-6)
for x = 5, 10 do img:drawPixel(x, 4, skin) end
for x = 5, 10 do img:drawPixel(x, 5, skin) end
for x = 5, 10 do img:drawPixel(x, 6, skin) end
-- Eyes
img:drawPixel(6, 5, eye)
img:drawPixel(9, 5, eye)

-- Neck (row 7)
img:drawPixel(7, 7, skin)
img:drawPixel(8, 7, skin)

-- Shirt (row 8-10)
for y = 8, 10 do
  for x = 4, 11 do img:drawPixel(x, y, shirt) end
end
-- Arms
for y = 8, 10 do
  img:drawPixel(3, y, skin)
  img:drawPixel(12, y, skin)
end

-- Pants (row 11-12)
for y = 11, 12 do
  for x = 5, 7 do img:drawPixel(x, y, pants) end
  for x = 9, 11 do img:drawPixel(x, y, pants) end
end

-- Shoes (row 13)
for x = 4, 7 do img:drawPixel(x, 13, shoes) end
for x = 9, 12 do img:drawPixel(x, 13, shoes) end

sprite:saveCopyAs("/Users/lopez/.openclaw/workspace/projects/vutler/sprites/test-agent.png")
