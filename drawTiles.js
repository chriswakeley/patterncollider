// this p5 sketch is written in instance mode
// read more here: https://github.com/processing/p5.js/wiki/Global-and-instance-mode

function sketch(parent) { // we pass the sketch data from the parent
  return function( p ) { // p could be any variable name
    // p5 sketch goes here
    let canvas;
    let passThroughShader, blurShader, finalRenderShader;
    let gl; // WebGL rendering context
    
    // Graphics objects / Framebuffers
    // let initialDistFieldTex; // REMOVED - Not strictly needed for RBF only
    // let tileDataTex;         // REMOVED - Using raw WebGL texture now
    let tileDataTextureObject = null; // Will hold the WebGL texture object
    let tileDataFloatArray = null;  // Will hold the JS float array
    let tileDataTexSize = 32; // Size of the data texture (32x32 = 1024)
    let brightness_premult = 100;
    
    let needsDataTextureUpdate = true; // Flag to rebuild initial texture
    let maxObservedDist = 1.0; // Initialize

    // Blur settings
    const blurPasses = 15; // Higher passes for standard Gaussian blur (was 10)

    // Helper to convert hex color (not needed for this approach)
    /*
    function hexToRgbFloat(hex) {
      // ... 
    }
    */

    // Function to prepare the initial texture with distance data
    function prepareInitialDataTexture(data) {
      if (!data.tiles || Object.keys(data.tiles).length === 0 || !tileDataTextureObject) {
        // Optional: Clear texture if needed? Or just let new data overwrite?
        console.warn("prepareInitialDataTexture called but tiles or texture object missing");
        return; // Not ready yet
      }

      let tiles = Object.values(data.tiles);
      
      let tileCount = 0;
      const MAX_TILES_FOR_SHADER = tileDataTexSize * tileDataTexSize; 
      const textureDataSize = MAX_TILES_FOR_SHADER * 4; // 4 components (RGBA) per tile
      tileDataFloatArray = new Float32Array(textureDataSize);

      // Pre-calculate transform factors
      let preFactor = data.zoom * Math.min(p.width, p.height) / data.steps;
      let panOffset = p.createVector(data.pan * data.steps * preFactor, 0);
      let rotateRad = p.radians(data.rotate);
      panOffset.rotate(rotateRad);
      
      for (let tile of tiles) {
        if (!tile.mean || tileCount >= MAX_TILES_FOR_SHADER) continue;
        
        let neighbors = Object.values(tile.neighbors);
        // Basic minDist calculation (consider improving robustness later)
        let minDistance = 0;
        if (neighbors.length >= 2 && neighbors[0]?.length >=2 && neighbors[1]?.length >= 2) {
             minDistance = Math.min(
              p.dist(neighbors[0][0].x, neighbors[0][0].y, neighbors[1][0].x, neighbors[1][0].y),
              p.dist(neighbors[0][0].x, neighbors[0][0].y, neighbors[1][1].x, neighbors[1][1].y),
              p.dist(neighbors[0][1].x, neighbors[0][1].y, neighbors[1][0].x, neighbors[1][0].y),
              p.dist(neighbors[0][1].x, neighbors[0][1].y, neighbors[1][1].x, neighbors[1][1].y)
            );
        } // Add handling for fewer neighbors if needed

        // Calculate screen position (center 0,0)
        let screenX = tile.mean.x * preFactor;
        let screenY = tile.mean.y * preFactor;
        let rotatedX = screenX * Math.cos(rotateRad) - screenY * Math.sin(rotateRad) + panOffset.x;
        let rotatedY = screenX * Math.sin(rotateRad) + screenY * Math.cos(rotateRad) + panOffset.y;

        // Map screen position to Normalized Coords (0-1 for texture encoding)
        let normX = p.map(rotatedX, -p.width / 2, p.width / 2, 0, 1, true); 
        let normY = p.map(rotatedY, -p.height / 2, p.height / 2, 0, 1, true);

        // --- Apply Power/Multiplier --- 
        let rawValue = minDistance;
        let powValue = (typeof parent.data.dot_pow === 'number' && !isNaN(parent.data.dot_pow)) ? parent.data.dot_pow : 1.0;
        let multValue = (typeof parent.data.dot_mult === 'number' && !isNaN(parent.data.dot_mult)) ? parent.data.dot_mult : 1.0;
        let processedValue = 0;
        if (typeof rawValue === 'number' && !isNaN(rawValue) && rawValue >= 0) { 
           processedValue = Math.pow(rawValue * brightness_premult, powValue) * multValue; 
        } 
        let brightnessForShader = p.constrain(processedValue / 255.0, 0.0, 1.0); // Normalize to 0-1 for float texture
        // ------------------------------

        // --- Store Data in Float Array --- 
        let arrayIndex = tileCount * 4;
        tileDataFloatArray[arrayIndex + 0] = normX; // R = normX
        tileDataFloatArray[arrayIndex + 1] = normY; // G = normY
        tileDataFloatArray[arrayIndex + 2] = brightnessForShader; // B = brightness (0-1)
        tileDataFloatArray[arrayIndex + 3] = 1.0; // A = Active flag (optional, but good practice)
        
        if (tileCount < 5) { // Log first 5 tiles
            console.log(`Storing Tile ${tileCount}: normX=${normX.toFixed(3)}, normY=${normY.toFixed(3)}, brightness=${brightnessForShader.toFixed(3)}`);
        }
        // -----------------------------

        tileCount++; // Increment actual tile count
      }
      
      // --- Upload Data to GPU Texture ---
      gl.bindTexture(gl.TEXTURE_2D, tileDataTextureObject);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, // level
                       0, 0, // xoffset, yoffset
                       tileDataTexSize, tileDataTexSize, // width, height
                       gl.RGBA, gl.FLOAT, 
                       tileDataFloatArray); // Upload the data
      gl.bindTexture(gl.TEXTURE_2D, null); // Unbind
      // ----------------------------------

      parent.tileCountForShader = tileCount; // Store count for p.draw
      needsDataTextureUpdate = false; // Reset flag
      console.log(`Tile Data Float Texture Updated. Stored ${tileCount} tiles.`);
    }

    // Helper function to bind source texture for shader pass
    // Now expects source to be a p5.Graphics (2D) object.
    function bindSourceTexture(source, shader, unit) { 
        shader.setUniform('u_inputTex', source); 
        // The 'unit' parameter might be ignored by p5 when passing the object directly.
    }

    p.preload = function() {
      // passThroughShader = p.loadShader('passThrough.vert', 'passThrough.vert'); // REMOVED - Incorrect load and unused
      // blurShader = p.loadShader('passThrough.vert', 'shaders/blur.frag'); // REMOVED - File not found and unused
      finalRenderShader = p.loadShader('passThrough.vert', 'shaders/finalRender.frag'); // Corrected path
    }

    p.setup = function() {
      let target = parent.$el.parentElement;
      let width = target.clientWidth;
      let height = target.clientHeight;
      canvas = p.createCanvas(width, height, p.WEBGL);
      canvas.parent(parent.$el);
      parent.$emit('update:resize-completed'); 
      parent.$emit('update:width', width); 
      parent.$emit('update:height', height); 
      p.pixelDensity(1); 
      p.noStroke(); 
      
      gl = p.drawingContext; 

      // --- Create Raw Float Texture for Tile Data ---
      tileDataTextureObject = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tileDataTextureObject);
      
      // Allocate storage for 32x32 float texture (RGBA)
      const level = 0;
      const internalFormat = gl.RGBA32F; // Use 32-bit float format
      const border = 0;
      const srcFormat = gl.RGBA;
      const srcType = gl.FLOAT;
      const data = null; // Allocate storage, but don't upload data yet
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, 
                    tileDataTexSize, tileDataTexSize, border, 
                    srcFormat, srcType, data);

      // Set NEAREST filtering and CLAMP_TO_EDGE wrapping
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      gl.bindTexture(gl.TEXTURE_2D, null); // Unbind
      console.log("Created and configured float tileDataTextureObject");
      // -------------------------------------------

      prepareInitialDataTexture(parent.data); 
      // setTextureParameters(tileDataTex); // REMOVED
    };

    p.draw = function() {
      if (needsDataTextureUpdate) {
          prepareInitialDataTexture(parent.data);
          // setTextureParameters(tileDataTex); // REMOVED
      }
      
      if (!tileDataTextureObject) return; 

      // --- Set texture parameters for tileDataTex (once) ---
      /* // REMOVED - Using helper function now
      if (!tileDataTexParamsSet && tileDataTex._glTexture) {
          try {
              gl.bindTexture(gl.TEXTURE_2D, tileDataTex._glTexture);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
              gl.bindTexture(gl.TEXTURE_2D, null); // Unbind
              tileDataTexParamsSet = true;
              console.log("Set NEAREST filtering and CLAMP_TO_EDGE wrap on tileDataTex in p.draw");
          } catch (e) {
              console.error("Error setting texture parameters in p.draw:", e);
              tileDataTexParamsSet = true; // Prevent repeated attempts if error occurs
          }
      } else if (!tileDataTexParamsSet && !tileDataTex._glTexture) {
          // Optional: Log if the texture is still not ready on the first few frames
          // console.log("tileDataTex._glTexture not ready yet in p.draw");
      }
      */
      // ----------------------------------------------------

      // --- RBF Interpolation Approach ---
      const texelSize = [1.0 / p.width, 1.0 / p.height]; // Keep for final shader if needed
      const inputTextureUnit = 0; // Keep if needed
      
      let currentSource = tileDataTextureObject; // Still needed?

      // Skip blur loop
      /*
      p.push(); 
      p.noStroke(); 
      for (let i = 0; i < blurPasses; i++) {
          // ... loop ...
      }
      p.pop(); 
      let finalBlurredTex = currentSource; 
      */
      
      // --- Prepare Data for RBF Shader --- 
      let tileCount = tileDataTexSize * tileDataTexSize; // Max tiles based on texture size
      // Pad array if needed (REMOVED)
      /*
      let paddedTileData = [...tileData];
      while (paddedTileData.length < MAX_TILES * 3) {
          paddedTileData.push(0.0, 0.0, 0.0); // Pad with dummy vec3
      }
      */
      // Check tile count (still relevant)
      if (tileCount > tileDataTexSize * tileDataTexSize) {
          console.warn(`Tile count (${tileCount}) exceeds MAX_TILES (${tileDataTexSize * tileDataTexSize}). Clamping.`);
          tileCount = tileDataTexSize * tileDataTexSize;
      }
      // console.log(`tileCount for shader: ${tileCount}`); // Removed log
      let rbfFalloff = 50.0; // Reverted falloff to default
      // -----------------------------------
      
      // --- Final Render Shader Block (RBF Interpolation) ---
      p.background(0); // Clear main canvas before final render 
      
      // --- Activate texture unit and bind data texture ---
      const dataTextureUnit = 1; // Use texture unit 1 (0 is often default)
      gl.activeTexture(gl.TEXTURE0 + dataTextureUnit);
      gl.bindTexture(gl.TEXTURE_2D, tileDataTextureObject);
      // --------------------------------------------------
      
      p.shader(finalRenderShader); 
      // Pass tile data and control uniforms
      finalRenderShader.setUniform('u_tileDataTexture', dataTextureUnit); // Pass TEXTURE UNIT INDEX
      finalRenderShader.setUniform('u_tileDataTextureSize', [tileDataTexSize, tileDataTexSize]); // Pass texture dimensions
      finalRenderShader.setUniform('u_tileCount', tileCount);
      finalRenderShader.setUniform('u_falloffFactor', rbfFalloff);
      finalRenderShader.setUniform('u_resolution', [p.width, p.height]); // For coordinate conversion
      // We don't need u_smoothedTex or u_texelSize if calculation is done purely from u_tileData
      // finalRenderShader.setUniform('u_maxDistValue', maxObservedDist); 

      p.ortho(); // Set orthographic projection before drawing rect
      p.rect(-p.width / 2, -p.height / 2, p.width, p.height); // Draw fullscreen quad
      p.resetShader();
      
      // --- Unbind texture from unit ---
      gl.activeTexture(gl.TEXTURE0 + dataTextureUnit);
      gl.bindTexture(gl.TEXTURE_2D, null);
      // -----------------------------
      
      // --- TEST: Draw solid color without shader ---
      // p.background(255, 0, 0); // Set background to red
      // ---------------------------------------------
    };
    
    p.dataChanged = function(data, oldData) {
      if (!canvas || !gl) return; 
      // Detect resize
      let target = parent.$el.parentElement;
      let newWidth = target.clientWidth;
      let newHeight = target.clientHeight;
      let resized = false;
      if ((data.display == 'none' || newWidth !== p.width || newHeight !== p.height) && newWidth > 0 && newHeight > 0) {
         p.resizeCanvas(newWidth, newHeight);
         // Also resize graphics buffers!
         // initialDistFieldTex.resizeCanvas(newWidth, newHeight); // REMOVED
         // tileDataTex.resizeCanvas(newWidth, newHeight); // REMOVED
         
         // --- Recreate float texture on resize? ---
         // For now, just delete. prepareInitialDataTexture will recreate/repopulate if needed.
         if (tileDataTextureObject) {
             gl.deleteTexture(tileDataTextureObject);
             tileDataTextureObject = null; // Ensure it gets recreated
             console.log("Deleted tileDataTextureObject on resize");
         }
         // TODO: Could potentially recreate texture here with same size?
         // -----------------------------------------
         
         // setTextureParameters(tileDataTex); // REMOVED
         parent.$emit('update:resize-completed'); 
         parent.$emit('update:width', newWidth); 
         parent.$emit('update:height', newHeight); 
         resized = true;
      }
       
      // Flag to rebuild data texture if relevant data changed or canvas resized
      // Compare specific relevant properties between data and oldData
      if (resized || 
          data.tiles !== oldData.tiles || // Simplest check, might be too sensitive
          data.zoom !== oldData.zoom ||
          data.pan !== oldData.pan ||
          data.rotate !== oldData.rotate ||
          data.steps !== oldData.steps ||
          data.dot_mult !== oldData.dot_mult || // Add slider value
          data.dot_pow !== oldData.dot_pow     // Add slider value
         /* Add other params affecting position/minDist */) { 
          needsDataTextureUpdate = true;
          // Ensure tile count is reset if data updates
          tileCount = 0;
          // console.log("dataChanged triggered texture update due to slider change or other."); // REMOVE DEBUG
      }
       
      // Handle download (still not supported well)
      if (data.download > oldData.download) {
          console.warn("SVG/Image Download might not represent the smoothed view.");
          // Could try saving finalBlurredTex? p.save(finalBlurredTex, ...)
      }
       
      // No explicit redraw needed, draw loop runs continuously
    };

    // --- Mouse Interaction Logic (Keep CPU detection, no visual feedback) ---
    // ... (whichSide, tileToString, getSelectedTile, mouse events) ...
    // Note: getSelectedTile still uses data.tiles, which is fine.
    function whichSide(xp, yp, x1, y1, x2, y2) {
      return Math.sign((yp - y1) * (x2 -x1) - (xp - x1) * (y2 - y1));
    }
    
    function tileToString(tile) {
      return JSON.stringify({
        x: tile.x,
        y: tile.y
      });
    }
    
    let selectedTile = {};
    let recentHover = false;
    let recentlySelectedTiles = [];
    let adding = true;
    let prevX = 0;
    let prevY = 0;

     function getSelectedTile(mouseX_canvas, mouseY_canvas) {
       if (!parent.data.tiles || Object.keys(parent.data.tiles).length === 0 || !p.width || !p.height) {
         return {};
       }
       let mouseX_world = mouseX_canvas - p.width / 2;
       let mouseY_world = mouseY_canvas - p.height / 2;
       let preFactor = parent.data.zoom * Math.min(p.width, p.height) / parent.data.steps;
       let panOffset = p.createVector(parent.data.pan * parent.data.steps * preFactor, 0);
       let rotateRad = p.radians(parent.data.rotate);
       panOffset.rotate(rotateRad);
       let unPannedX = mouseX_world - panOffset.x;
       let unPannedY = mouseY_world - panOffset.y;
       let unRotatedX = unPannedX * Math.cos(-rotateRad) - unPannedY * Math.sin(-rotateRad);
       let unRotatedY = unPannedX * Math.sin(-rotateRad) + unPannedY * Math.cos(-rotateRad);
       let x_tileSpace = unRotatedX / preFactor;
       let y_tileSpace = unRotatedY / preFactor;
 
       let mySelectedTile = {};
       let min_dist_sq = Infinity;
       
       // Find closest tile center (selection doesn't use minDist directly)
       for (let tile of Object.values(parent.data.tiles)) {
         if (tile && tile.mean) {
           let dist_sq = Math.pow(x_tileSpace - tile.mean.x, 2) + Math.pow(y_tileSpace - tile.mean.y, 2);
            if (dist_sq < min_dist_sq) { 
                min_dist_sq = dist_sq;
                mySelectedTile = tile;
            }
         }
       }
       // Optionally add check if click is within *some* radius of closest tile?

       return mySelectedTile;
     }
 
     p.mouseDragged = function() {
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
         // Interpolation logic (can likely be removed if selection doesn't need high freq)
         /*
         let mouseDistance = p.dist(p.mouseX, p.mouseY, prevX, prevY);
         let preFactor = parent.data.zoom * Math.min(p.width, p.height) / parent.data.steps; 
         let stepSize = p.max(1, preFactor/10); 
         if (mouseDistance > stepSize) {
            // ... interpolation ...
         }
         */
         prevX = p.mouseX;
         prevY = p.mouseY;
       }
     }
 
     p.mouseMoved = function() {
       if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
         recentHover = true;
         selectedTile = getSelectedTile(p.mouseX, p.mouseY); 
         prevX = p.mouseX;
         prevY = p.mouseY;
       } else if (recentHover) {
         recentHover = false;
         selectedTile = {}; 
       }
     };
 
     p.mousePressed = function() {
       if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
         selectedTile = getSelectedTile(p.mouseX, p.mouseY);
         if (Object.keys(selectedTile).length > 0) {
           let tileString = tileToString(selectedTile);
           let index = parent.data.selectedTiles.findIndex(e => e.x == selectedTile.x && e.y == selectedTile.y);
           adding = index < 0; 
           if (!recentlySelectedTiles.includes(tileString)) {
             updateSelectedTiles(selectedTile, adding);
             recentlySelectedTiles.push(tileString);
           }            
         } 
         prevX = p.mouseX;
         prevY = p.mouseY;
       }
     };
 
     p.mouseReleased = function() {
       recentlySelectedTiles = [];
     };
 
     function updateSelectedTiles(tile, addMode) {
       if (addMode) {
         parent.$emit('update:add-tile', tile);
       } else {
         parent.$emit('update:remove-tile', tile); 
       }
     }
  };
}