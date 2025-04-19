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
    let tileCount = 0;
    const MAX_TILES = 4096; // Max tiles supported by texture size (e.g., 32x32 = 1024)
    const TEXTURE_SIZE = 64; // Texture dimensions (TEXTURE_SIZE x TEXTURE_SIZE)
    let tilePositions = new Float32Array(MAX_TILES * 2); // Store XY
    let tileDistances = new Float32Array(MAX_TILES * 1); // Store minDistance

    // Uniform locations
    let uScreenSizeLoc;
    let uTilePositionsLoc;
    let uTileDataLoc;
    let uTileCountLoc;
    let uInterpolationPowerLoc;

    // Keep hexToRgbFloat for now, might be useful later? Or remove if unused.
    function hexToRgbFloat(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
      ] : [0, 0, 0]; 
    }

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
        uTileCountLoc = gl.getUniformLocation(program, "uTileCount");
        uInterpolationPowerLoc = gl.getUniformLocation(program, "uInterpolationPower");

        if (!uScreenSizeLoc || !uTilePositionsLoc || !uTileDataLoc || !uTileCountLoc || !uInterpolationPowerLoc) {
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
        tilePositions.fill(0);
        tileDistances.fill(0);
      } else {
          let tiles = Object.values(data.tiles);
          let preFactor = data.zoom * Math.min(p.width, p.height) / data.steps;
          let panOffset = p.createVector(data.pan * data.steps * preFactor, 0);
          let rotateRad = p.radians(data.rotate);
          panOffset.rotate(rotateRad);
          //let effectiveZoom = Math.max(0.01, data.zoom); // Not directly needed here?
          
          for (let i = 0; i < tiles.length && i < MAX_TILES; i++) {
              let tile = tiles[i];
              if (!tile.mean || !tile.neighbors) continue; 

              // Calculate screen position (center of canvas is 0,0 for shader)
              let worldX = tile.mean.x * preFactor;
              let worldY = tile.mean.y * preFactor;
              let rotatedX = worldX * Math.cos(rotateRad) - worldY * Math.sin(rotateRad) + panOffset.x;
              let rotatedY = worldX * Math.sin(rotateRad) + worldY * Math.cos(rotateRad) + panOffset.y;
              
              // Convert to pixel coordinates (origin top-left for frag shader gl_FragCoord)
              let screenX = rotatedX + p.width / 2;
              let screenY = rotatedY + p.height / 2; 
              
              tilePositions[tileCount * 2 + 0] = screenX;
              tilePositions[tileCount * 2 + 1] = screenY;
              
              // Calculate minDistance (raw value, shader will handle interpolation)
              let neighbors = Object.values(tile.neighbors);
              
              let minDistance = Infinity;
              if (neighbors.length >= 2 && neighbors[0].length >=1 && neighbors[1].length >=1) { // Basic check
                   // This calculation seems complex and potentially error-prone
                   // Re-check the neighbor structure and intended calculation if issues arise
                   try { 
                        minDistance = Math.min(
                            // Check all 4 corner combinations between the two neighbor points/structures
                            Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][0].y, 2)),
                            neighbors[1].length > 1 ? Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][1].y, 2)) : Infinity,
                            neighbors[0].length > 1 ? Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][0].y, 2)) : Infinity,
                            (neighbors[0].length > 1 && neighbors[1].length > 1) ? Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][1].y, 2)) : Infinity
                        );
                        // Scale minDistance by preFactor like the original radius calculation did?
                        // Let's scale it here to potentially keep values in a more manageable range
                        minDistance = Math.pow((minDistance) * preFactor, data.dotSizePow) * data.dotSizeMult; 
                   } catch(e) {
                        console.error("Error calculating minDistance for tile:", tile, e);
                        minDistance = 0; // Default on error
                   }
              } else {
                   minDistance = 0; // Default if neighbors aren't as expected
                   console.log("No neighbors found for tile:", tile);
              }
                   
                  /*
              let minDistance = Math.min(
                Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][0].y, 2)),
                Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][1].y, 2)),
                Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][0].y, 2)),
                Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][1].y, 2))
              );
              //console.log("minDistance:", minDistance);
              minDistance = Math.pow((minDistance) * preFactor, data.dotSizePow) * data.dotSizeMult;
              */
              // TODO: Need to normalize or scale this minDistance appropriately 
              //       before passing to shader, or handle normalization in shader.
              //       For now, pass the scaled value. Consider its range.
              tileDistances[tileCount] = minDistance; 
              
              tileCount++;
          }
          // Zero out remaining slots if fewer than MAX_TILES
          for (let i = tileCount; i < MAX_TILES; i++) {
              tilePositions[i * 2 + 0] = 0;
              tilePositions[i * 2 + 1] = 0;
              tileDistances[i] = 0;
          }
      }

      // Update textures
      if (gl && tilePosTexture && tileDataTexture) { 
           updateFloatTexture(tilePosTexture, TEXTURE_SIZE, TEXTURE_SIZE, tilePositions);
           updateFloatTexture(tileDataTexture, TEXTURE_SIZE, TEXTURE_SIZE, tileDistances);
      }
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
      if (!tilePosTexture || !tileDataTexture) {
           console.error("Failed to create float textures. Aborting setup.");
           return; // Stop if textures couldn't be created
      } 
      
      p.shader(brightnessShader); // Apply shader 
      getUniformLocations(); // Get locations for new shader
      setupAttributes(); // Setup quad attributes
      
      prepareData(parent.data); // Prepare initial data and textures
    };

    p.draw = function() {
      p.background(0); 
      
      let program = brightnessShader._glProgram;
      gl.useProgram(program); // Ensure raw GL context uses the program
      
      // --- Set Uniforms ---
      if (uScreenSizeLoc) {
          gl.uniform2f(uScreenSizeLoc, p.width, p.height);
      }
      if (uTileCountLoc) {
           gl.uniform1i(uTileCountLoc, tileCount); 
      }
      if (uInterpolationPowerLoc) {
           // Make this controllable via parent.data later? 
           gl.uniform1f(uInterpolationPowerLoc, 2); // Default power of 2
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

      // --- Bind Attributes ---
      let aPositionLoc = gl.getAttribLocation(program, "aPosition");
      if (aPositionLoc !== -1) {
           gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
           gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0); 
           gl.enableVertexAttribArray(aPositionLoc);
      } else {
           console.error("aPosition attribute location invalid in draw loop.");
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
             parent.$emit('update:resize-completed'); 
             parent.$emit('update:width', newWidth); 
             parent.$emit('update:height', newHeight); 
          }
       }
       
       prepareData(data); 
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