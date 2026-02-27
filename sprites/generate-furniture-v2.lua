-- Generate detailed furniture sprites for Pixel Office v2
local OUT = "/Users/lopez/.openclaw/workspace/projects/vutler/sprites/"

local function c(r,g,b,a) return Color(r,g,b,a or 255) end

local function make(w, h, name, fn)
  local sp = Sprite(w, h, ColorMode.RGB)
  local img = sp.cels[1].image
  fn(img, w, h)
  sp:saveCopyAs(OUT .. name .. ".png")
  sp:close()
end

-- ============ DESK WITH MONITOR (top-down/isometric style) ============
make(32, 20, "desk-monitor", function(img, w, h)
  local wood_top = c(160, 120, 75)
  local wood_edge = c(120, 85, 50)
  local wood_dark = c(90, 65, 35)
  local screen_frame = c(45, 45, 55)
  local screen = c(30, 60, 100)
  local screen_glow = c(60, 130, 220)
  local keyboard = c(55, 55, 60)
  local key = c(70, 70, 80)
  local mouse = c(65, 65, 70)
  local cup = c(220, 220, 230)
  local coffee = c(120, 70, 30)
  local leg = c(80, 80, 85)

  -- Desk top surface
  for x = 0, w-1 do
    for y = 8, 14 do img:drawPixel(x, y, wood_top) end
  end
  -- Top edge (darker)
  for x = 0, w-1 do img:drawPixel(x, 8, wood_edge) end
  -- Front edge
  for x = 0, w-1 do img:drawPixel(x, 14, wood_edge) end
  for x = 0, w-1 do img:drawPixel(x, 15, wood_dark) end

  -- Legs
  for y = 16, 19 do
    img:drawPixel(2, y, leg); img:drawPixel(3, y, leg)
    img:drawPixel(w-3, y, leg); img:drawPixel(w-4, y, leg)
  end

  -- Monitor (on desk)
  for x = 10, 21 do
    for y = 0, 7 do img:drawPixel(x, y, screen_frame) end
  end
  -- Screen content
  for x = 11, 20 do
    for y = 1, 6 do img:drawPixel(x, y, screen) end
  end
  -- Code lines on screen
  for x = 12, 15 do img:drawPixel(x, 2, screen_glow) end
  for x = 12, 18 do img:drawPixel(x, 3, c(80,180,120)) end
  for x = 12, 14 do img:drawPixel(x, 4, screen_glow) end
  for x = 12, 17 do img:drawPixel(x, 5, c(200,150,80)) end
  -- Monitor stand
  img:drawPixel(15, 8, screen_frame); img:drawPixel(16, 8, screen_frame)

  -- Keyboard
  for x = 10, 21 do
    for y = 10, 11 do img:drawPixel(x, y, keyboard) end
  end
  for x = 11, 20 do img:drawPixel(x, 10, key) end

  -- Mouse
  img:drawPixel(24, 10, mouse); img:drawPixel(25, 10, mouse)
  img:drawPixel(24, 11, mouse); img:drawPixel(25, 11, mouse)

  -- Coffee cup
  img:drawPixel(4, 10, cup); img:drawPixel(5, 10, cup)
  img:drawPixel(4, 11, cup); img:drawPixel(5, 11, cup)
  img:drawPixel(4, 11, coffee); img:drawPixel(5, 11, coffee)
end)

-- ============ OFFICE CHAIR (top-down) ============
make(14, 16, "office-chair", function(img, w, h)
  local seat = c(60, 60, 75)
  local back = c(50, 50, 65)
  local arm = c(55, 55, 68)
  local base = c(70, 70, 75)
  local wheel = c(40, 40, 45)

  -- Chair back
  for x = 3, 10 do
    for y = 0, 3 do img:drawPixel(x, y, back) end
  end
  for x = 4, 9 do img:drawPixel(x, 0, c(65,65,80)) end -- highlight

  -- Seat
  for x = 2, 11 do
    for y = 4, 8 do img:drawPixel(x, y, seat) end
  end
  -- Armrests
  for y = 3, 7 do
    img:drawPixel(1, y, arm); img:drawPixel(12, y, arm)
  end

  -- Center pole
  for y = 9, 12 do
    img:drawPixel(6, y, base); img:drawPixel(7, y, base)
  end

  -- Wheel base (star pattern)
  img:drawPixel(3, 13, base); img:drawPixel(10, 13, base)
  img:drawPixel(6, 14, base); img:drawPixel(7, 14, base)
  -- Wheels
  img:drawPixel(2, 14, wheel); img:drawPixel(11, 14, wheel)
  img:drawPixel(5, 15, wheel); img:drawPixel(8, 15, wheel)
end)

-- ============ WHITEBOARD ============
make(28, 18, "whiteboard", function(img, w, h)
  local frame = c(180, 180, 185)
  local board = c(240, 240, 245)
  local marker_r = c(220, 60, 60)
  local marker_b = c(60, 100, 220)
  local marker_g = c(40, 180, 80)

  -- Frame
  for x = 0, w-1 do
    img:drawPixel(x, 0, frame); img:drawPixel(x, h-3, frame)
  end
  for y = 0, h-3 do
    img:drawPixel(0, y, frame); img:drawPixel(w-1, y, frame)
  end
  -- Board
  for x = 1, w-2 do
    for y = 1, h-4 do img:drawPixel(x, y, board) end
  end
  -- Tray
  for x = 2, w-3 do
    img:drawPixel(x, h-2, c(160,160,165))
    img:drawPixel(x, h-1, c(140,140,145))
  end
  -- Markers on tray
  for x = 5, 7 do img:drawPixel(x, h-2, marker_r) end
  for x = 9, 11 do img:drawPixel(x, h-2, marker_b) end
  for x = 13, 15 do img:drawPixel(x, h-2, marker_g) end

  -- Content on board
  -- Red box (architecture diagram)
  for x = 4, 10 do img:drawPixel(x, 3, marker_r) end
  for x = 4, 10 do img:drawPixel(x, 6, marker_r) end
  for y = 3, 6 do img:drawPixel(4, y, marker_r); img:drawPixel(10, y, marker_r) end
  -- Arrow
  for x = 11, 15 do img:drawPixel(x, 4, marker_b) end
  img:drawPixel(14, 3, marker_b); img:drawPixel(14, 5, marker_b)
  -- Another box
  for x = 16, 22 do img:drawPixel(x, 3, marker_b) end
  for x = 16, 22 do img:drawPixel(x, 6, marker_b) end
  for y = 3, 6 do img:drawPixel(16, y, marker_b); img:drawPixel(22, y, marker_b) end
  -- Bullet list
  img:drawPixel(4, 9, marker_g)
  for x = 6, 14 do img:drawPixel(x, 9, c(180,180,185)) end
  img:drawPixel(4, 11, marker_g)
  for x = 6, 12 do img:drawPixel(x, 11, c(180,180,185)) end
  img:drawPixel(4, 13, marker_g)
  for x = 6, 16 do img:drawPixel(x, 13, c(180,180,185)) end
end)

-- ============ SERVER RACK (detailed) ============
make(16, 32, "server-rack-v2", function(img, w, h)
  local frame = c(55, 58, 65)
  local panel = c(35, 38, 45)
  local vent = c(25, 28, 32)
  local screw = c(90, 90, 95)
  local led_g = c(0, 255, 80)
  local led_r = c(255, 40, 40)
  local led_b = c(40, 120, 255)
  local led_y = c(255, 200, 0)
  local led_off = c(30, 30, 35)
  local port = c(20, 20, 25)

  -- Rack frame
  for x = 0, w-1 do
    for y = 0, h-1 do img:drawPixel(x, y, frame) end
  end
  -- Top/bottom caps
  for x = 0, w-1 do img:drawPixel(x, 0, c(70,73,80)) end
  for x = 0, w-1 do img:drawPixel(x, h-1, c(40,43,50)) end

  -- 8 rack units
  for u = 0, 7 do
    local uy = 1 + u * 4
    -- Panel face
    for x = 1, w-2 do
      for y = uy, uy+3 do img:drawPixel(x, y, panel) end
    end
    -- Screws
    img:drawPixel(1, uy, screw); img:drawPixel(w-2, uy, screw)
    -- LED row
    img:drawPixel(3, uy+1, (u < 6) and led_g or led_r)
    img:drawPixel(5, uy+1, (u % 2 == 0) and led_b or led_g)
    img:drawPixel(7, uy+1, (u == 5) and led_y or led_off)
    -- Drive bays / ports
    for x = 9, 13 do img:drawPixel(x, uy+1, port) end
    -- Vent slots
    for x = 3, w-4 do img:drawPixel(x, uy+3, vent) end
    -- Activity light
    if u < 5 then
      img:drawPixel(3, uy+2, c(0, 180 + u*15, 60))
    end
  end
end)

-- ============ CONFERENCE TABLE (large, oval) ============
make(56, 24, "conference-table-v2", function(img, w, h)
  local top = c(140, 95, 50)
  local edge = c(110, 75, 40)
  local dark = c(80, 55, 30)
  local highlight = c(170, 125, 75)
  local leg = c(70, 50, 30)
  local paper = c(240, 240, 235)
  local text = c(60, 60, 70)

  -- Table top (rounded rectangle)
  for x = 4, w-5 do
    for y = 6, 17 do img:drawPixel(x, y, top) end
  end
  -- Rounded corners
  for x = 2, 3 do for y = 8, 15 do img:drawPixel(x, y, top) end end
  for x = w-4, w-3 do for y = 8, 15 do img:drawPixel(x, y, top) end end

  -- Edge highlight
  for x = 4, w-5 do img:drawPixel(x, 6, highlight) end
  -- Edge shadow
  for x = 4, w-5 do img:drawPixel(x, 17, edge) end
  for x = 4, w-5 do img:drawPixel(x, 18, dark) end

  -- Table legs
  for y = 19, 23 do
    img:drawPixel(10, y, leg); img:drawPixel(11, y, leg)
    img:drawPixel(w-12, y, leg); img:drawPixel(w-11, y, leg)
  end

  -- Items on table
  -- Paper stack 1
  for x = 12, 17 do
    for y = 9, 12 do img:drawPixel(x, y, paper) end
  end
  for x = 13, 16 do img:drawPixel(x, 10, text) end
  for x = 13, 15 do img:drawPixel(x, 11, text) end

  -- Laptop
  for x = 24, 33 do
    for y = 8, 14 do img:drawPixel(x, y, c(50,50,55)) end
  end
  for x = 25, 32 do
    for y = 9, 13 do img:drawPixel(x, y, c(40,80,140)) end
  end

  -- Paper stack 2
  for x = 39, 44 do
    for y = 10, 13 do img:drawPixel(x, y, paper) end
  end
end)

-- ============ COFFEE MACHINE (detailed) ============
make(16, 20, "coffee-machine-v2", function(img, w, h)
  local body = c(65, 65, 70)
  local front = c(55, 55, 60)
  local chrome = c(160, 165, 170)
  local display = c(20, 20, 25)
  local display_text = c(0, 200, 80)
  local cup_w = c(240, 240, 245)
  local coffee_c = c(100, 60, 20)
  local steam = c(200, 200, 210, 80)
  local btn_r = c(200, 50, 50)
  local btn_g = c(50, 200, 80)
  local drip = c(30, 30, 35)

  -- Machine body
  for x = 2, 13 do
    for y = 4, 15 do img:drawPixel(x, y, body) end
  end
  -- Front panel
  for x = 3, 12 do
    for y = 5, 14 do img:drawPixel(x, y, front) end
  end
  -- Top (water tank)
  for x = 3, 12 do
    for y = 0, 3 do img:drawPixel(x, y, c(100, 140, 200, 120)) end
  end
  for x = 3, 12 do img:drawPixel(x, 0, chrome) end

  -- Display
  for x = 4, 11 do
    for y = 5, 7 do img:drawPixel(x, y, display) end
  end
  img:drawPixel(5, 6, display_text); img:drawPixel(6, 6, display_text)
  img:drawPixel(8, 6, display_text); img:drawPixel(9, 6, display_text)

  -- Buttons
  img:drawPixel(5, 9, btn_g); img:drawPixel(7, 9, btn_r)
  img:drawPixel(9, 9, chrome); img:drawPixel(11, 9, chrome)

  -- Drip tray
  for x = 4, 11 do img:drawPixel(x, 12, chrome) end
  for x = 4, 11 do
    for y = 13, 14 do img:drawPixel(x, y, drip) end
  end
  -- Spout
  img:drawPixel(7, 10, chrome); img:drawPixel(8, 10, chrome)
  img:drawPixel(7, 11, chrome); img:drawPixel(8, 11, chrome)

  -- Cup
  for x = 6, 9 do img:drawPixel(x, 13, cup_w) end
  img:drawPixel(6, 14, cup_w); img:drawPixel(9, 14, cup_w)
  img:drawPixel(7, 14, coffee_c); img:drawPixel(8, 14, coffee_c)

  -- Base
  for x = 1, 14 do
    img:drawPixel(x, 16, c(45,45,50))
    img:drawPixel(x, 17, c(35,35,40))
  end

  -- Steam
  img:drawPixel(7, 12, steam); img:drawPixel(8, 11, steam)
end)

-- ============ PING PONG TABLE (detailed) ============
make(40, 22, "pingpong-v2", function(img, w, h)
  local green = c(0, 130, 65)
  local green_d = c(0, 105, 50)
  local white = c(255, 255, 255)
  local net_post = c(100, 100, 105)
  local net = c(200, 200, 205)
  local leg = c(70, 70, 75)
  local ball = c(255, 140, 0)
  local paddle_r = c(200, 40, 40)
  local paddle_b = c(40, 60, 200)

  -- Table surface
  for x = 0, w-1 do
    for y = 3, 14 do img:drawPixel(x, y, green) end
  end
  -- Surface lines
  for x = 0, w-1 do img:drawPixel(x, 3, white) end
  for x = 0, w-1 do img:drawPixel(x, 14, white) end
  for y = 3, 14 do img:drawPixel(0, y, white); img:drawPixel(w-1, y, white) end
  -- Center line
  for y = 3, 14 do img:drawPixel(19, y, white); img:drawPixel(20, y, white) end
  -- Half lines
  for x = 0, w-1 do img:drawPixel(x, 8, c(0,140,70)) end

  -- Net
  for x = 18, 21 do
    for y = 0, 2 do img:drawPixel(x, y, net) end
  end
  img:drawPixel(18, 0, net_post); img:drawPixel(21, 0, net_post)
  for y = 0, 3 do
    img:drawPixel(17, y, net_post); img:drawPixel(22, y, net_post)
  end

  -- Table front edge (3D effect)
  for x = 0, w-1 do
    img:drawPixel(x, 15, green_d)
    img:drawPixel(x, 16, c(0, 85, 40))
  end

  -- Legs
  for y = 17, 21 do
    img:drawPixel(3, y, leg); img:drawPixel(4, y, leg)
    img:drawPixel(w-5, y, leg); img:drawPixel(w-4, y, leg)
    img:drawPixel(17, y, leg); img:drawPixel(22, y, leg)
  end

  -- Ball
  img:drawPixel(10, 6, ball); img:drawPixel(11, 6, ball)
  img:drawPixel(10, 7, ball); img:drawPixel(11, 7, ball)

  -- Paddles
  for y = 5, 9 do img:drawPixel(5, y, paddle_r) end
  img:drawPixel(4, 6, paddle_r); img:drawPixel(4, 7, paddle_r); img:drawPixel(4, 8, paddle_r)
  for y = 5, 9 do img:drawPixel(34, y, paddle_b) end
  img:drawPixel(35, 6, paddle_b); img:drawPixel(35, 7, paddle_b); img:drawPixel(35, 8, paddle_b)
end)

-- ============ SOFA (detailed) ============
make(32, 18, "sofa-v2", function(img, w, h)
  local fabric = c(65, 65, 115)
  local fabric_l = c(80, 80, 135)
  local fabric_d = c(50, 50, 95)
  local cushion = c(75, 75, 130)
  local arm = c(55, 55, 100)
  local leg_c = c(100, 75, 45)
  local pillow = c(200, 180, 100)

  -- Back rest
  for x = 3, w-4 do
    for y = 0, 6 do img:drawPixel(x, y, fabric_d) end
  end
  for x = 4, w-5 do img:drawPixel(x, 0, fabric_l) end -- highlight

  -- Seat cushions
  for x = 3, w-4 do
    for y = 7, 12 do img:drawPixel(x, y, fabric) end
  end
  -- Cushion divisions
  for y = 7, 12 do img:drawPixel(10, y, fabric_d); img:drawPixel(21, y, fabric_d) end
  -- Cushion highlights
  for x = 5, 9 do img:drawPixel(x, 8, cushion) end
  for x = 12, 20 do img:drawPixel(x, 8, cushion) end
  for x = 23, w-5 do img:drawPixel(x, 8, cushion) end

  -- Arms
  for y = 2, 12 do
    img:drawPixel(0, y, arm); img:drawPixel(1, y, arm); img:drawPixel(2, y, arm)
    img:drawPixel(w-3, y, arm); img:drawPixel(w-2, y, arm); img:drawPixel(w-1, y, arm)
  end
  -- Arm tops (rounded)
  for x = 0, 2 do img:drawPixel(x, 1, arm) end
  for x = w-3, w-1 do img:drawPixel(x, 1, arm) end

  -- Throw pillow
  for x = 4, 8 do
    for y = 3, 6 do img:drawPixel(x, y, pillow) end
  end
  img:drawPixel(6, 4, c(220,200,120))

  -- Front edge
  for x = 0, w-1 do img:drawPixel(x, 13, fabric_d) end

  -- Legs
  for y = 14, 17 do
    img:drawPixel(3, y, leg_c); img:drawPixel(w-4, y, leg_c)
  end
end)

-- ============ PLANT / POTTED TREE ============
make(14, 22, "plant-v2", function(img, w, h)
  local pot = c(180, 90, 50)
  local pot_d = c(140, 70, 35)
  local soil = c(70, 45, 25)
  local trunk = c(120, 80, 40)
  local leaf = c(30, 160, 70)
  local leaf_d = c(20, 120, 50)
  local leaf_l = c(50, 200, 90)

  -- Pot
  for x = 3, 10 do
    for y = 16, 21 do img:drawPixel(x, y, pot) end
  end
  for x = 2, 11 do img:drawPixel(x, 16, pot) end -- rim
  for x = 2, 11 do img:drawPixel(x, 15, c(200,110,60)) end -- rim top
  -- Pot shadow
  for x = 4, 10 do img:drawPixel(x, 21, pot_d) end
  -- Soil
  for x = 3, 10 do img:drawPixel(x, 16, soil) end

  -- Trunk
  for y = 10, 15 do
    img:drawPixel(6, y, trunk); img:drawPixel(7, y, trunk)
  end

  -- Leaves (bushy top)
  local leaves = {
    {5,9},{6,9},{7,9},{8,9},
    {4,8},{5,8},{6,8},{7,8},{8,8},{9,8},
    {3,7},{4,7},{5,7},{6,7},{7,7},{8,7},{9,7},{10,7},
    {3,6},{4,6},{5,6},{6,6},{7,6},{8,6},{9,6},{10,6},
    {4,5},{5,5},{6,5},{7,5},{8,5},{9,5},
    {4,4},{5,4},{6,4},{7,4},{8,4},{9,4},
    {5,3},{6,3},{7,3},{8,3},
    {6,2},{7,2},
    {2,7},{11,7},{3,5},{10,5},
    {5,1},{8,1},
  }
  for _, p in ipairs(leaves) do
    local shade = (p[1] + p[2]) % 3
    local col = shade == 0 and leaf or shade == 1 and leaf_d or leaf_l
    img:drawPixel(p[1], p[2], col)
  end
end)

-- ============ MONITOR WALL (for War Room) ============
make(40, 16, "monitor-wall", function(img, w, h)
  local frame = c(35, 35, 40)
  local screen = c(15, 25, 50)
  local bezel = c(25, 25, 30)

  -- 3 monitors side by side
  for m = 0, 2 do
    local mx = m * 13 + 1
    -- Bezel
    for x = mx, mx+11 do
      for y = 1, 12 do img:drawPixel(x, y, bezel) end
    end
    -- Screen
    for x = mx+1, mx+10 do
      for y = 2, 11 do img:drawPixel(x, y, screen) end
    end
    -- Content varies per monitor
    if m == 0 then
      -- Chart
      local vals = {8,6,9,5,7,10,8,6,9}
      for i, v in ipairs(vals) do
        for y = 11-v, 10 do
          img:drawPixel(mx+1+i, y, c(40, 200, 100))
        end
      end
    elseif m == 1 then
      -- World map dots
      local dots = {{3,4},{5,3},{7,5},{4,7},{8,4},{6,8},{9,6},{2,5},{10,7}}
      for _, d in ipairs(dots) do
        img:drawPixel(mx+d[1], d[2], c(255, 100, 50))
      end
      -- Grid lines
      for x = mx+1, mx+10 do img:drawPixel(x, 6, c(20,40,70)) end
      for y = 2, 11 do img:drawPixel(mx+5, y, c(20,40,70)) end
    else
      -- Terminal text
      for row = 0, 4 do
        local len = 3 + (row * 2) % 7
        for x = mx+2, mx+1+len do
          img:drawPixel(x, 3+row*2, c(0, 200, 80))
        end
      end
    end
  end
  -- Wall mount bar
  for x = 0, w-1 do img:drawPixel(x, 0, c(50,50,55)) end
  for x = 0, w-1 do img:drawPixel(x, 13, c(50,50,55)) end
end)

-- ============ BOOKSHELF ============
make(20, 24, "bookshelf", function(img, w, h)
  local wood = c(130, 90, 50)
  local shelf = c(110, 75, 40)
  local books = {
    c(200,60,60), c(60,100,200), c(60,180,80), c(200,180,60),
    c(180,60,180), c(60,180,200), c(200,120,60), c(100,60,160),
  }

  -- Frame
  for y = 0, h-1 do
    img:drawPixel(0, y, wood); img:drawPixel(1, y, wood)
    img:drawPixel(w-2, y, wood); img:drawPixel(w-1, y, wood)
  end
  for x = 0, w-1 do img:drawPixel(x, 0, wood); img:drawPixel(x, h-1, wood) end

  -- 4 shelves
  for s = 0, 3 do
    local sy = 5 + s * 5
    for x = 0, w-1 do img:drawPixel(x, sy, shelf) end

    -- Books on shelf
    local bx = 3
    for b = 1, 4 + (s % 2) do
      local bw = 2 + (b % 2)
      local bh = 3 + (b % 2)
      local col = books[((s*4+b) % #books) + 1]
      for x = bx, bx+bw-1 do
        for y = sy-bh, sy-1 do
          if x < w-2 then img:drawPixel(x, y, col) end
        end
      end
      bx = bx + bw + 1
      if bx >= w-3 then break end
    end
  end
end)

print("All v2 furniture generated!")
