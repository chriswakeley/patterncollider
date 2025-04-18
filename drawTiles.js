// this p5 sketch is written in instance mode
// read more here: https://github.com/processing/p5.js/wiki/Global-and-instance-mode

function sketch(parent) { // we pass the sketch data from the parent
  return function( p ) { // p could be any variable name
    // p5 sketch goes here
    let canvas;
    let passThroughShader, blurShader, finalRenderShader;
    let gl; // WebGL rendering context
    
    // Graphics objects / Framebuffers
    let initialDistFieldTex; // 2D Graphics to draw initial points
    // let pingPongTexA;        // WEBGL Graphics for blurring (REMOVED)
    // let pingPongTexB;        // WEBGL Graphics for blurring (REMOVED)
    let tempBufferA;         // 2D Graphics for temp blur storage
    let tempBufferB;         // 2D Graphics for temp blur storage
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
      if (!data.tiles || Object.keys(data.tiles).length === 0 || !initialDistFieldTex) {
        if(initialDistFieldTex) initialDistFieldTex.background(0); // Clear if exists
        return; // Not ready yet
      }

      let tiles = Object.values(data.tiles);
      
      // --- REMOVED: Find actual max minDist --- 
      /*
      maxObservedDist = 0; 
      for (let tile of tiles) {
          if (tile && typeof tile.minDist !== 'undefined') {
              maxObservedDist = Math.max(maxObservedDist, tile.minDist);
          }
      }
      // Use the observed max, or 1.0 if none found (avoid division by zero)
      let normalizationMax = (maxObservedDist > 0) ? maxObservedDist : 1.0;
      */
      // -----------------------------
      
      initialDistFieldTex.push(); // Use push/pop for 2D graphics state
      initialDistFieldTex.background(0, 0, 0, 0); 
      initialDistFieldTex.noStroke();
      
      // Pre-calculate transform factors
      let preFactor = data.zoom * Math.min(p.width, p.height) / data.steps;
      let panOffset = p.createVector(data.pan * data.steps * preFactor, 0);
      let rotateRad = p.radians(data.rotate);
      panOffset.rotate(rotateRad);
      
      // Map tile centers and draw distance values
      let logCount = 0; // Add a counter for logging
      for (let tile of tiles) {
        if (!tile.mean) continue;
        let neighbors = Object.values(tile.neighbors);
        let minDistance = Math.min(
          Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][0].y, 2)),
          Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][1].y, 2)),
          Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][0].y, 2)),
          Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][1].y, 2))
        ); 

        // Calculate screen position (center 0,0)
        let screenX = tile.mean.x * preFactor;
        let screenY = tile.mean.y * preFactor;
        let rotatedX = screenX * Math.cos(rotateRad) - screenY * Math.sin(rotateRad) + panOffset.x;
        let rotatedY = screenX * Math.sin(rotateRad) + screenY * Math.cos(rotateRad) + panOffset.y;

        // Map screen position (center 0,0) to texture coordinates (top-left 0,0)
        let texX = p.map(rotatedX, -p.width / 2, p.width / 2, 0, initialDistFieldTex.width, true); // Clamp values
        let texY = p.map(rotatedY, -p.height / 2, p.height / 2, 0, initialDistFieldTex.height, true);

        // --- Apply Power/Multiplier and Clamp (Restored) --- 
        let rawValue = minDistance;
        console.log("minDistance", minDistance);
        // Revert to accessing from parent.data initially
        let powValue = (typeof parent.data.dot_pow === 'number' && !isNaN(parent.data.dot_pow)) ? parent.data.dot_pow : 1.0;
        let multValue = (typeof parent.data.dot_mult === 'number' && !isNaN(parent.data.dot_mult)) ? parent.data.dot_mult : 1.0;
        // console.log(`prepareInitialDataTexture: parent has dot_pow? ${parent.hasOwnProperty('dot_pow')}, dot_mult? ${parent.hasOwnProperty('dot_mult')}. Using pow=${powValue}, mult=${multValue}`); // REMOVE DEBUG
        let processedValue = 0;
        if (typeof rawValue === 'number' && !isNaN(rawValue) && rawValue >= 0) { // Check if rawValue is valid
           processedValue = Math.pow(rawValue * brightness_premult, powValue) * multValue; // Apply pow and mult
        } else {
            // console.warn("Invalid tile.minDist encountered:", rawValue); // Log invalid minDist - Optional
        }
        let encodedVal = p.constrain(Math.floor(processedValue), 0, 255); // Clamp to 0-255
        // ----------------------------------------
        
        // --- Logging (Optional) --- 
        /*
        if (logCount < 10) { 
            console.log(`Tile ${logCount}: minDist=${rawValue?.toFixed(3)}, pow=${powValue}, mult=${multValue}, processed=${processedValue.toFixed(3)}, encodedVal=${encodedVal}, tex=(${texX.toFixed(1)}, ${texY.toFixed(1)})`);
            logCount++;
        }
        */
        // ------------------

        // Draw a point (or tiny rect) - use Red for value, Alpha as seed marker
        // Ensure background clear includes alpha (above)
        initialDistFieldTex.fill(encodedVal, 0, 0, 255); // Store value in Red, set Alpha=1 ONLY here
        initialDistFieldTex.rect(texX, texY, 1, 1); // Draw 1x1 pixel
      }
      initialDistFieldTex.pop();
      needsDataTextureUpdate = false; // Reset flag
      console.log("Initial Data Texture Updated for Max Propagation.");
    }

    // Helper function to bind source texture for shader pass
    // Now expects source to be a p5.Graphics (2D) object.
    function bindSourceTexture(source, shader, unit) { 
        shader.setUniform('u_inputTex', source); 
        // The 'unit' parameter might be ignored by p5 when passing the object directly.
    }

    p.preload = function() {
      passThroughShader = p.loadShader('passThrough.vert', 'passThrough.vert'); // Use same vert for all
      blurShader = p.loadShader('passThrough.vert', 'blur.frag');
      finalRenderShader = p.loadShader('passThrough.vert', 'finalRender.frag');
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

      // Create graphics objects
      let texWidth = p.width;
      let texHeight = p.height;
      initialDistFieldTex = p.createGraphics(texWidth, texHeight); 
      // pingPongTexA = p.createGraphics(texWidth, texHeight, p.WEBGL); // REMOVED
      // pingPongTexB = p.createGraphics(texWidth, texHeight, p.WEBGL); // REMOVED
      tempBufferA = p.createGraphics(texWidth, texHeight);
      tempBufferB = p.createGraphics(texWidth, texHeight);
      // Explicitly enable alpha for WebGL buffers (REMOVED)
      // pingPongTexA.setAttributes({ alpha: true });
      // pingPongTexB.setAttributes({ alpha: true });
      // pingPongTexA.noSmooth(); 
      // pingPongTexB.noSmooth();
      // Ensure temp buffers don't affect main canvas stroke/fill
      tempBufferA.noStroke();
      tempBufferB.noStroke();

      prepareInitialDataTexture(parent.data); 
    };

    p.draw = function() {
      if (needsDataTextureUpdate) {
          prepareInitialDataTexture(parent.data);
      }
      
      if (!initialDistFieldTex || !tempBufferA || !tempBufferB) return; 

      // --- Perform Blur using Main Canvas & Temp 2D Buffers ---
      const texelSize = [1.0 / p.width, 1.0 / p.height]; // Use main canvas size
      const inputTextureUnit = 0; // Texture unit (might be ignored)
      
      let currentSource = initialDistFieldTex; // Start with the raw data (2D Graphics)

      p.push(); // Save main canvas state if needed
      p.noStroke(); // Ensure no stroke for rects

      // --- Restore Full Blur Loop --- 
      for (let i = 0; i < blurPasses; i++) { // <-- Restore loop
          // --- Horizontal Pass --- (Draw to main canvas p)
          // Direction doesn't strictly matter for this max shader, but keep structure
          p.shader(blurShader); // Max propagation shader
          bindSourceTexture(currentSource, blurShader, inputTextureUnit); // Source is initial or tempBufferB
          blurShader.setUniform('u_texelSize', texelSize);
          blurShader.setUniform('u_blurDirection', [1.0, 0.0]); 
          p.rect(-p.width / 2, -p.height / 2, p.width, p.height); // Draw on main canvas
          p.resetShader(); // Reset shader on main canvas
          
          // Copy result from main canvas to temp buffer A
          tempBufferA.clear(); // Clear target buffer before copy
          tempBufferA.image(p, 0, 0, tempBufferA.width, tempBufferA.height); 
          currentSource = tempBufferA; // Result of H pass is now the source for V pass

          // --- Vertical Pass --- (Draw to main canvas p)
          p.shader(blurShader);
          bindSourceTexture(currentSource, blurShader, inputTextureUnit); // Source is tempBufferA
          blurShader.setUniform('u_texelSize', texelSize);
          blurShader.setUniform('u_blurDirection', [0.0, 1.0]); 
          p.rect(-p.width / 2, -p.height / 2, p.width, p.height); // Draw on main canvas
          p.resetShader(); // Reset shader on main canvas
          
          // Copy result from main canvas to temp buffer B
          tempBufferB.clear(); // Clear target buffer before copy
          tempBufferB.image(p, 0, 0, tempBufferB.width, tempBufferB.height);
          currentSource = tempBufferB; // Result of V pass is now the source for next H pass
      }
      p.pop(); // Restore main canvas state

      // After the loop, currentSource holds the final blurred result (last V pass -> tempBufferB)
      let finalBlurredTex = currentSource; 
      // ------------------------

      // --- Final Render Shader Block --- (Draw to main canvas p)
      p.background(0); // Clear main canvas before final render 
      p.shader(finalRenderShader); // Use standard final render shader
      bindSourceTexture(finalBlurredTex, finalRenderShader, inputTextureUnit); // Use result from loop
      finalRenderShader.setUniform('u_smoothedTex', finalBlurredTex); // Use result from loop
      finalRenderShader.setUniform('u_maxDistValue', maxObservedDist); // Pass max observed distance
      finalRenderShader.setUniform('u_resolution', [p.width, p.height]);
      finalRenderShader.setUniform('u_texelSize', texelSize); // Pass texel size
      p.rect(-p.width / 2, -p.height / 2, p.width, p.height); // Draw on main canvas
      p.resetShader();
      // -----------------------------
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
         initialDistFieldTex.resizeCanvas(newWidth, newHeight);
         // pingPongTexA.resizeCanvas(newWidth, newHeight); // REMOVED
         // pingPongTexB.resizeCanvas(newWidth, newHeight); // REMOVED
         tempBufferA.resizeCanvas(newWidth, newHeight);
         tempBufferB.resizeCanvas(newWidth, newHeight);
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