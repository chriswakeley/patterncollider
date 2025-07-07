// this p5 sketch is written in instance mode
// read more here: https://github.com/processing/p5.js/wiki/Global-and-instance-mode

function sketch(parent) { // we pass the sketch data from the parent
  return function( p ) { // p could be any variable name
    // p5 sketch goes here
    let canvas;
    let brightnessShader; // Renamed shader variable
    let gl; // WebGL rendering context
    let floatTexturesExt; // OES_texture_float extension

    // Geometry for a full-screen quad
    let quadVBO;
    const quadVertices = new Float32Array([
      -1.0, -1.0,  // Bottom Left
       1.0, -1.0,  // Bottom Right
      -1.0,  1.0,  // Top Left
       1.0,  1.0   // Top Right
    ]);

    // Data Textures
    let tilePosTexture = null;
    let tileDataTexture = null;
    let tileDirections1Texture = null;
    let tileDirections2Texture = null;
    let tileCount = 0;
    const MAX_TILES = 16384; // Max tiles supported by texture size (e.g., 32x32 = 1024)
    const TEXTURE_SIZE = 128; // Texture dimensions (TEXTURE_SIZE x TEXTURE_SIZE)
    let tilePositions = new Float32Array(MAX_TILES * 2); // Store XY
    let tileDistances = new Float32Array(MAX_TILES * 1); // Store minDistance
    let tileDirections1 = new Float32Array(MAX_TILES * 2); // Store first line direction XY
    let tileDirections2 = new Float32Array(MAX_TILES * 2); // Store second line direction XY

    // Uniform locations
    let uScreenSizeLoc;
    let uTilePositionsLoc;
    let uTileDataLoc;
    let uTileDirections1Loc;
    let uTileDirections2Loc;
    let uTileCountLoc;
    let uInterpolationPowerLoc;
    let uColor1Loc;

    // Performance optimization variables
    let lastTileCount = -1;
    let shaderReady = false;
    let texturesDirty = false;
    let needsRedraw = true;
    let screenSizeDirty = true;

    // Helper function to create a Float texture
    function createFloatTexture(width, height) {
        if (!floatTexturesExt) {
            console.error("Float textures not supported/enabled!");
            return null;
        }
        let texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Use RGBA format even for vec2/float to ensure broad compatibility, pack data accordingly
        // Use NEAREST filtering and CLAMP_TO_EDGE wrap for data textures
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return texture;
    }
    
    // Function to update a Float texture with data
    function updateFloatTexture(texture, width, height, data) {
        if (!texture || !floatTexturesExt) return;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Create a padded RGBA buffer from the source data
        let paddedData = new Float32Array(width * height * 4);
        if (data.length === width * height * 2) { // Assuming vec2 data (positions)
             for (let i = 0; i < width * height; i++) {
                 paddedData[i * 4 + 0] = data[i * 2 + 0]; // R = X
                 paddedData[i * 4 + 1] = data[i * 2 + 1]; // G = Y
                 // B, A are unused
             }
        } else if (data.length === width * height) { // Assuming float data (minDistance)
             for (let i = 0; i < width * height; i++) {
                 paddedData[i * 4 + 0] = data[i]; // R = minDistance
                 // G, B, A are unused
             }
        } else {
             console.error("Data size mismatch for texture update");
             gl.bindTexture(gl.TEXTURE_2D, null);
             return;
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, paddedData);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Function to create and fill VBOs (Quad only)
    function setupBuffers() {
        gl = p.drawingContext;

        // --- Quad VBO --- 
        quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind
    }
    
    // Function to get uniform locations
    function getUniformLocations() {
        if (!brightnessShader || !brightnessShader._glProgram) {
             console.error("Shader not ready for getting uniform locations.");
             return;
        }
        let program = brightnessShader._glProgram;
        uScreenSizeLoc = gl.getUniformLocation(program, "uScreenSize");
        uTilePositionsLoc = gl.getUniformLocation(program, "uTilePositions");
        uTileDataLoc = gl.getUniformLocation(program, "uTileData");
        uTileDirections1Loc = gl.getUniformLocation(program, "uTileDirections1");
        uTileDirections2Loc = gl.getUniformLocation(program, "uTileDirections2");
        uTileCountLoc = gl.getUniformLocation(program, "uTileCount");
        uInterpolationPowerLoc = gl.getUniformLocation(program, "uInterpolationPower");
        uColor1Loc = gl.getUniformLocation(program, "uColor1");

        if (!uScreenSizeLoc || !uTilePositionsLoc || !uTileDataLoc || !uTileDirections1Loc || !uTileDirections2Loc || !uTileCountLoc || !uInterpolationPowerLoc || !uColor1Loc) {
             console.warn("Could not find one or more uniform locations. Check shader names.");
        }
    }

    // Function to setup vertex attributes (Quad only)
    function setupAttributes() {
        let program = brightnessShader._glProgram; 
        if (!program) {
            console.error("Shader program not available for attribute setup.");
            return;
        }

        let aPositionLoc = gl.getAttribLocation(program, "aPosition");
        if (aPositionLoc === -1) {
             console.warn("Shader attribute aPosition not found.");
        }

        // --- Quad Attributes --- 
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(aPositionLoc);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind
    }

    // Function to prepare data and update textures
    function prepareData(data) {
      tileCount = 0;
      
      if (!data.tiles || Object.keys(data.tiles).length === 0 || !p.width || !p.height) {
        // Use typed array fill for better performance
        tilePositions.fill(0);
        tileDistances.fill(0);
        tileDirections1.fill(0);
        tileDirections2.fill(0);
      } else {
          // Pre-calculate all constants outside the loop
          const tiles = Object.values(data.tiles);
          const preFactor = data.zoom * Math.min(p.width, p.height) / data.steps;
          const rotateRad = p.radians(data.rotate);
          const cosRot = Math.cos(rotateRad);
          const sinRot = Math.sin(rotateRad);
          const panX = data.pan * data.steps * preFactor / cosRot * -2.5;
          const panY = 0;
          const halfWidth = p.width * 0.5;
          const halfHeight = p.height * 0.5;
          const radiusScale = 0.01 * data.radius * preFactor / data.zoom;
          
          // Create typed array views for better cache locality
          const posView = new Float32Array(tilePositions.buffer, 0, MAX_TILES * 2);
          const distView = new Float32Array(tileDistances.buffer, 0, MAX_TILES);
          const dir1View = new Float32Array(tileDirections1.buffer, 0, MAX_TILES * 2);
          const dir2View = new Float32Array(tileDirections2.buffer, 0, MAX_TILES * 2);
          
          const maxTiles = Math.min(tiles.length, MAX_TILES);
          
          for (let i = 0; i < maxTiles; i++) {
              const tile = tiles[i];
              if (!tile.mean || !tile.neighbors || !tile.lines) continue;
              
              // Pre-calculate world position
              const worldX = tile.mean.x * preFactor;
              const worldY = tile.mean.y * preFactor;
              // Apply rotation and pan in one step
              const screenX = worldX * cosRot - worldY * sinRot + panX + halfWidth;
              const screenY = worldX * sinRot + worldY * cosRot + panY + halfHeight;
              
              // Direct array access with pre-calculated index
              const posIndex = tileCount << 1; // tileCount * 2
              posView[posIndex] = screenX;
              posView[posIndex + 1] = screenY;
              
              // Optimized minDistance calculation
              const neighbors = Object.values(tile.neighbors);
              let minDistanceSq = Infinity;
              
              if (neighbors.length >= 2) {
                const n0 = neighbors[0];
                const n1 = neighbors[1];
                
                if (n0.length > 0 && n1.length > 0) {
                  const maxLen0 = Math.min(2, n0.length);
                  const maxLen1 = Math.min(2, n1.length);
                  
                  for (let i = 0; i < maxLen0; i++) {
                    const p0 = n0[i];
                    for (let j = 0; j < maxLen1; j++) {
                      const p1 = n1[j];
                      const dx = p0.x - p1.x;
                      const dy = p0.y - p1.y;
                      const distSq = dx * dx + dy * dy;
                      if (distSq < minDistanceSq) minDistanceSq = distSq;
                    }
                  }
                }
              }

              // Calculate final distance with pre-calculated scale
              let minDistance = 0;
              if (minDistanceSq < Infinity) {
                minDistance = Math.pow(Math.sqrt(minDistanceSq) * radiusScale, data.dotSizePow) * data.dotSizeMult;
              } else {
                console.log("No valid neighbors found for tile:", tile);
              }
              
              distView[tileCount] = minDistance;
              
              // Use pre-calculated directions from Vue
              let dir1X = 0, dir1Y = 0, dir2X = 0, dir2Y = 0;
              if (tile.directions && tile.directions.length >= 2) {
                dir1X = tile.directions[0].x;
                dir1Y = tile.directions[0].y;
                dir2X = tile.directions[1].x;
                dir2Y = tile.directions[1].y;
              }
              
              // Store direction vectors
              const dirIndex = tileCount << 1; // tileCount * 2
              dir1View[dirIndex] = dir1X;
              dir1View[dirIndex + 1] = dir1Y;
              dir2View[dirIndex] = dir2X;
              dir2View[dirIndex + 1] = dir2Y;
              
              tileCount++;
          }
          
          // Zero remaining slots more efficiently
          if (tileCount < MAX_TILES) {
            posView.fill(0, tileCount * 2);
            distView.fill(0, tileCount);
            dir1View.fill(0, tileCount * 2);
            dir2View.fill(0, tileCount * 2);
          }
      }

      // Mark textures as needing update
      texturesDirty = true;
    }

    p.preload = function() {
      brightnessShader = p.loadShader("brightnessMap.vert", "brightnessMap.frag");
    }

    p.setup = function() {
      let target = parent.$el.parentElement;
      let width = target.clientWidth;
      let height = target.clientHeight;
      canvas = p.createCanvas(width, height, p.WEBGL);
      canvas.parent(parent.$el);
      parent.$emit("update:resize-completed"); 
      parent.$emit("update:width", width); 
      parent.$emit("update:height", height); 
      p.pixelDensity(1); 
      p.noStroke(); 
      
      gl = p.drawingContext; 

      // Get float texture extension
      floatTexturesExt = gl.getExtension('OES_texture_float');
      if (!floatTexturesExt) {
          alert("WebGL extension OES_texture_float not supported.");
          console.error("OES_texture_float not supported. Cannot use float textures.");
          // Potentially fall back to encoding floats in RGBA8 textures if needed
      } 

      setupBuffers(); // Setup quad buffer
      
      // Create float textures
      tilePosTexture = createFloatTexture(TEXTURE_SIZE, TEXTURE_SIZE);
      tileDataTexture = createFloatTexture(TEXTURE_SIZE, TEXTURE_SIZE);
      tileDirections1Texture = createFloatTexture(TEXTURE_SIZE, TEXTURE_SIZE);
      tileDirections2Texture = createFloatTexture(TEXTURE_SIZE, TEXTURE_SIZE);
      if (!tilePosTexture || !tileDataTexture || !tileDirections1Texture || !tileDirections2Texture) {
           console.error("Failed to create float textures. Aborting setup.");
           return; // Stop if textures couldn't be created
      } 
      
      p.shader(brightnessShader); // Apply shader 
      getUniformLocations(); // Get locations for new shader
      setupAttributes(); // Setup quad attributes
      shaderReady = true; // Mark shader as ready
      
      prepareData(parent.data); // Prepare initial data and textures
      
      //p.frameRate(30); // Set target frame rate for continuous draw
    };

    p.draw = function() {
      if (!needsRedraw) return;
      
      // Skip p5's background() - it's doing extra work
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      if (!shaderReady) return;
      
      // Direct WebGL calls without p5 wrapper overhead
      let program = brightnessShader._glProgram;
      gl.useProgram(program); // Ensure raw GL context uses the program
      
      // --- Set Uniforms ---
      // Screen size only needs updating on resize
      if (screenSizeDirty && uScreenSizeLoc) {
          gl.uniform2f(uScreenSizeLoc, p.width, p.height);
          screenSizeDirty = false;
      }
      
      // Only update uniforms that changed
      if (lastTileCount !== tileCount && uTileCountLoc) {
           gl.uniform1i(uTileCountLoc, tileCount);
           lastTileCount = tileCount;
      }
      
      if (uInterpolationPowerLoc) {
           // Make this controllable via parent.data later? 
           gl.uniform1f(uInterpolationPowerLoc, 2); // Default power of 2
      }
      
      // Set primary color uniform
      if (uColor1Loc && parent.data.primaryColor) {
           gl.uniform3fv(uColor1Loc, parent.data.primaryColor);
      }
      
      // Only update textures when data changed
      if (texturesDirty && gl && tilePosTexture && tileDataTexture && tileDirections1Texture && tileDirections2Texture && tileCount > 0) {
        updateFloatTexture(tilePosTexture, TEXTURE_SIZE, TEXTURE_SIZE, tilePositions);
        updateFloatTexture(tileDataTexture, TEXTURE_SIZE, TEXTURE_SIZE, tileDistances);
        updateFloatTexture(tileDirections1Texture, TEXTURE_SIZE, TEXTURE_SIZE, tileDirections1);
        updateFloatTexture(tileDirections2Texture, TEXTURE_SIZE, TEXTURE_SIZE, tileDirections2);
        texturesDirty = false;
      }
      
      // Bind textures
      if (uTilePositionsLoc && tilePosTexture) {
          gl.activeTexture(gl.TEXTURE0); // Activate texture unit 0
          gl.bindTexture(gl.TEXTURE_2D, tilePosTexture);
          gl.uniform1i(uTilePositionsLoc, 0); // Tell shader sampler to use texture unit 0
      }
      if (uTileDataLoc && tileDataTexture) {
          gl.activeTexture(gl.TEXTURE1); // Activate texture unit 1
          gl.bindTexture(gl.TEXTURE_2D, tileDataTexture);
          gl.uniform1i(uTileDataLoc, 1); // Tell shader sampler to use texture unit 1
      }
      if (uTileDirections1Loc && tileDirections1Texture) {
          gl.activeTexture(gl.TEXTURE2); // Activate texture unit 2
          gl.bindTexture(gl.TEXTURE_2D, tileDirections1Texture);
          gl.uniform1i(uTileDirections1Loc, 2); // Tell shader sampler to use texture unit 2
      }
      if (uTileDirections2Loc && tileDirections2Texture) {
          gl.activeTexture(gl.TEXTURE3); // Activate texture unit 3
          gl.bindTexture(gl.TEXTURE_2D, tileDirections2Texture);
          gl.uniform1i(uTileDirections2Loc, 3); // Tell shader sampler to use texture unit 3
      }

      // --- Bind Attributes ---
      let aPositionLoc = gl.getAttribLocation(program, "aPosition");
      if (aPositionLoc !== -1) {
           gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
           gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0); 
           gl.enableVertexAttribArray(aPositionLoc);
      } else {
           console.error("aPosition attribute location invalid in draw loop.");
           needsRedraw = false;
           return; // Don't draw if attribute isn't found
      }
      
      // --- Draw the Quad ---
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the 4 vertices of the quad

      // --- Clean up ---
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.activeTexture(gl.TEXTURE0); // Unbind textures (optional but good practice)
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      
      needsRedraw = false;
    };
    
    // --- dataChanged and Mouse Interaction Logic ---
    p.dataChanged = function(data, oldData) {
       if (!canvas || !gl) return; 
       
       // Resize logic
       if (data.display == 'none' || parent.$el.parentElement.clientWidth !== p.width || parent.$el.parentElement.clientHeight !== p.height) {
          let target = parent.$el.parentElement;
          let newWidth = target.clientWidth;
          let newHeight = target.clientHeight;
          if (newWidth > 0 && newHeight > 0) {
             p.resizeCanvas(newWidth, newHeight);
             p.shader(brightnessShader); 
             getUniformLocations(); 
             setupAttributes(); 
             screenSizeDirty = true; // Mark screen size as needing update
             parent.$emit('update:resize-completed'); 
             parent.$emit('update:width', newWidth); 
             parent.$emit('update:height', newHeight); 
          }
       }
       
       prepareData(data);
       needsRedraw = true;
     };

    // Mouse interaction logic (getSelectedTile, mouseDragged, etc.)
    // can be kept for potential future use (e.g., clicking to see brightness value)
    // or removed if definitely not needed. Let's keep it for now.
    
    // --- Helper functions for mouse interaction (Keep for now) ---
    function whichSide(xp, yp, x1, y1, x2, y2) {
      return Math.sign((yp - y1) * (x2 -x1) - (xp - x1) * (y2 - y1));
    }
    
    function tileToString(tile) {
      // Need to ensure tile object structure is consistent if this is used
      return JSON.stringify({ 
        x: tile && tile.mean ? tile.mean.x : undefined, 
        y: tile && tile.mean ? tile.mean.y : undefined
      });
    }
    
    let selectedTile = {};
    let recentHover = false;
    let recentlySelectedTiles = [];
    let adding = true;
    let prevX = 0;
    let prevY = 0;

     function getSelectedTile(mouseX_canvas, mouseY_canvas) {
       // Disabled for now
       return {}; 
     }
 
     p.mouseDragged = function() {
       // Disabled for now 
       /*
       if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
         recentHover = true; 
         selectedTile = getSelectedTile(p.mouseX, p.mouseY); 
         if (Object.keys(selectedTile).length > 0) {
           let tileString = tileToString(selectedTile);
           if (!recentlySelectedTiles.includes(tileString)) {
             updateSelectedTiles(selectedTile, adding); 
             recentlySelectedTiles.push(tileString);
           }           
         } 
         prevX = p.mouseX;
         prevY = p.mouseY;
       }
       */
     }
 
     p.mouseMoved = function() {
       // Disabled for now
       /*
       if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
         recentHover = true;
         selectedTile = getSelectedTile(p.mouseX, p.mouseY); 
         prevX = p.mouseX;
         prevY = p.mouseY;
       } else if (recentHover) {
         recentHover = false;
         selectedTile = {}; 
       }
       */
     };
 
     p.mousePressed = function() {
       // Disabled for now
       /*
       if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
         selectedTile = getSelectedTile(p.mouseX, p.mouseY);
         if (Object.keys(selectedTile).length > 0) {
           let tileString = tileToString(selectedTile);
           let index = parent.data.selectedTiles.findIndex(t => t && selectedTile.mean && t.x === selectedTile.mean.x && t.y === selectedTile.mean.y);
           adding = index < 0; 
           if (!recentlySelectedTiles.includes(tileString)) {
             updateSelectedTiles(selectedTile, adding);
             recentlySelectedTiles.push(tileString);
           }           
         } 
         prevX = p.mouseX;
         prevY = p.mouseY;
       }
       */
     };
 
     p.mouseReleased = function() {
       // Still relevant to clear this array
       recentlySelectedTiles = [];
     };
 
     // This function might need updating based on how selected tiles are identified/stored
     function updateSelectedTiles(tile, addMode) {
       // Disabled for now
       /*
       let tileData = tile.mean ? { x: tile.mean.x, y: tile.mean.y, ...tile } : tile; 
       if (addMode) {
         parent.$emit('update:add-tile', tileData);
       } else {
         parent.$emit('update:remove-tile', tileData); 
       }
       */
     }

  };
}