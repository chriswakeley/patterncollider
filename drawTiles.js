// this p5 sketch is written in instance mode
// read more here: https://github.com/processing/p5.js/wiki/Global-and-instance-mode

function sketch(parent) { // we pass the sketch data from the parent
  return function( p ) { // p could be any variable name
    // p5 sketch goes here
    let canvas;
    let instancedShader;
    let gl; // WebGL rendering context
    let instancingExt; // ANGLE_instanced_arrays extension

    // Base geometry for the circle
    let circleVBO;          // Buffer for vertex positions (vec2)
    let circleVertices = [];  // JS array for base circle vertices
    const circleSegments = 32; // Number of vertices for the circle

    // Instance data VBOs
    let offsetVBO; // vec2 per instance (center position)
    let radiusVBO; // float per instance
    let colorVBO;  // vec3 per instance (color)

    // Arrays to hold instance data before upload
    let instanceOffsets = [];
    let instanceRadii = [];
    let instanceColors = [];
    let instanceCount = 0;

    // Uniform locations
    let uProjectionMatrixLoc;
    let uModelViewMatrixLoc;

    // Helper to convert hex color to vec3 array [R, G, B] (0.0-1.0)
    function hexToRgbFloat(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
      ] : [0, 0, 0]; // Default to black if parse fails
    }

    // Function to create the base circle geometry
    function createCircleGeometry() {
      circleVertices = [];
      // Center vertex for TRIANGLE_FAN
      circleVertices.push(0, 0);
      // Vertices around the circumference
      for (let i = 0; i <= circleSegments; i++) {
        let angle = (i / circleSegments) * p.TWO_PI;
        circleVertices.push(Math.cos(angle), Math.sin(angle));
      }
    }

    // Function to create and fill VBOs
    function setupBuffers() {
        gl = p.drawingContext; // Get the WebGL context

        // --- Base Circle VBO --- 
        circleVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, circleVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(circleVertices), gl.STATIC_DRAW);

        // --- Instance Data VBOs --- 
        offsetVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, offsetVBO);
        gl.bufferData(gl.ARRAY_BUFFER, 1024 * 2 * 4, gl.DYNAMIC_DRAW); 

        radiusVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, radiusVBO);
        gl.bufferData(gl.ARRAY_BUFFER, 1024 * 1 * 4, gl.DYNAMIC_DRAW); 

        colorVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
        gl.bufferData(gl.ARRAY_BUFFER, 1024 * 3 * 4, gl.DYNAMIC_DRAW); 
        
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind
    }
    
    // Function to get uniform locations (call after shader is loaded and applied)
    function getUniformLocations() {
        if (!instancedShader || !instancedShader._glProgram) {
             console.error("Shader not ready for getting uniform locations.");
             return;
        }
        let program = instancedShader._glProgram;
        uProjectionMatrixLoc = gl.getUniformLocation(program, "uProjectionMatrix");
        uModelViewMatrixLoc = gl.getUniformLocation(program, "uModelViewMatrix");

        if (!uProjectionMatrixLoc || !uModelViewMatrixLoc) {
             console.warn("Could not find matrix uniform locations. Check names in shader.");
        }
    }

    // Function to setup vertex attributes
    function setupAttributes() {
        if (!instancingExt) { 
            console.error("ANGLE_instanced_arrays extension not available for attribute setup.");
            return;
        }
        let program = instancedShader._glProgram; 
        if (!program) {
            console.error("Shader program not available for attribute setup.");
            return;
        }

        let aPositionLoc = gl.getAttribLocation(program, "aPosition");
        let aInstanceOffsetLoc = gl.getAttribLocation(program, "aInstanceOffset");
        let aInstanceRadiusLoc = gl.getAttribLocation(program, "aInstanceRadius");
        let aInstanceColorLoc = gl.getAttribLocation(program, "aInstanceColor");

        if (aPositionLoc === -1 || aInstanceOffsetLoc === -1 || aInstanceRadiusLoc === -1 || aInstanceColorLoc === -1) {
             console.warn("One or more shader attributes not found.");
        }

        // --- Base Circle Attributes --- 
        gl.bindBuffer(gl.ARRAY_BUFFER, circleVBO);
        gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(aPositionLoc);

        // --- Instance Attributes --- 
        gl.bindBuffer(gl.ARRAY_BUFFER, offsetVBO);
        gl.vertexAttribPointer(aInstanceOffsetLoc, 2, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(aInstanceOffsetLoc);
        instancingExt.vertexAttribDivisorANGLE(aInstanceOffsetLoc, 1); 

        gl.bindBuffer(gl.ARRAY_BUFFER, radiusVBO);
        gl.vertexAttribPointer(aInstanceRadiusLoc, 1, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(aInstanceRadiusLoc);
        instancingExt.vertexAttribDivisorANGLE(aInstanceRadiusLoc, 1); 

        gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
        gl.vertexAttribPointer(aInstanceColorLoc, 3, gl.FLOAT, false, 0, 0); 
        gl.enableVertexAttribArray(aInstanceColorLoc);
        instancingExt.vertexAttribDivisorANGLE(aInstanceColorLoc, 1); 

        gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind
    }

    // Function to prepare and upload instance data
    function prepareInstanceData(data) {
      instanceOffsets = [];
      instanceRadii = [];
      instanceColors = [];
      instanceCount = 0;

      if (!data.tiles || Object.keys(data.tiles).length === 0 || !p.width || !p.height || !data.colors) {
        return; 
      }
      let tiles = Object.values(data.tiles);
      let preFactor = data.zoom * Math.min(p.width, p.height) / data.steps;
      let panOffset = p.createVector(data.pan * data.steps * preFactor, 0);
      let rotateRad = p.radians(data.rotate);
      panOffset.rotate(rotateRad);
      let effectiveZoom = Math.max(0.01, data.zoom);

      for (let tile of tiles) {
        if (!tile.mean) continue; 
        let screenX = tile.mean.x * preFactor;
        let screenY = tile.mean.y * preFactor;
        let rotatedX = screenX * Math.cos(rotateRad) - screenY * Math.sin(rotateRad) + panOffset.x;
        let rotatedY = screenX * Math.sin(rotateRad) + screenY * Math.cos(rotateRad) + panOffset.y;
        instanceOffsets.push(rotatedX, rotatedY);
        
        let neighbors = Object.values(tile.neighbors);
        let minDistance = Math.min(
          Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][0].y, 2)),
          Math.sqrt(Math.pow(neighbors[0][0].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][0].y - neighbors[1][1].y, 2)),
          Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][0].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][0].y, 2)),
          Math.sqrt(Math.pow(neighbors[0][1].x - neighbors[1][1].x, 2) + Math.pow(neighbors[0][1].y - neighbors[1][1].y, 2))
        );

        let radius = Math.pow(minDistance * preFactor,data.dotSizePow) * data.dotSizeMult * effectiveZoom; 
        instanceRadii.push(radius);
        let colorVec = [0, 0, 0]; 
        if (data.colorTiles && data.colors && data.colors.length > 0) {
          const filterFunction = data.orientationColoring ? 
              (c) => c.angles === tile.angles :
              (c) => c.area === tile.area;
          let colorData = data.colors.find(filterFunction);
          if (colorData && colorData.fill) {
            colorVec = hexToRgbFloat(colorData.fill);
          }
        }
        instanceColors.push(...colorVec); 
        instanceCount++;
      }

      if (instanceCount > 0 && gl) { // Ensure gl context exists
           gl.bindBuffer(gl.ARRAY_BUFFER, offsetVBO);
           gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceOffsets), gl.DYNAMIC_DRAW); 
           gl.bindBuffer(gl.ARRAY_BUFFER, radiusVBO);
           gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceRadii), gl.DYNAMIC_DRAW);
           gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
           gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceColors), gl.DYNAMIC_DRAW);
           gl.bindBuffer(gl.ARRAY_BUFFER, null); 
      }
    }

    p.preload = function() {
      instancedShader = p.loadShader("instancedTile.vert", "instancedTile.frag");
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

      instancingExt = gl.getExtension("ANGLE_instanced_arrays");
      if (!instancingExt) {
          alert("WebGL Instancing not supported.");
          console.error("ANGLE_instanced_arrays extension not supported.");
          return; 
      }

      createCircleGeometry();
      setupBuffers(); 
      p.shader(instancedShader); // Apply shader to link it and make program available
      getUniformLocations(); // Get locations after shader is applied
      setupAttributes(); 
      
      prepareInstanceData(parent.data); 
    };

    p.draw = function() {
      p.background(0); 
      
      // Ensure p5 calculates its matrices (ortho or default camera)
      p.ortho(); // Using ortho is explicit
      
      if (instanceCount > 0 && instancingExt) { 
          let program = instancedShader._glProgram;
          gl.useProgram(program); // Ensure raw GL context uses the program
          
          // --- Manually set matrix uniforms --- 
          // Access internal p5 matrices (names might vary across p5 versions)
          if (p._renderer && p._renderer.uPMatrix && p._renderer.uMVMatrix && uProjectionMatrixLoc && uModelViewMatrixLoc) {
               gl.uniformMatrix4fv(uProjectionMatrixLoc, false, p._renderer.uPMatrix.mat4);
               gl.uniformMatrix4fv(uModelViewMatrixLoc, false, p._renderer.uMVMatrix.mat4);
          } else {
               console.warn("Could not access p5 matrices or uniform locations to set them manually.");
               // Fallback or error handling might be needed
          }
          // ------------------------------------

          // Re-enable attributes before drawing (Might still be needed)
           let aPositionLoc = gl.getAttribLocation(program, "aPosition");
           let aInstanceOffsetLoc = gl.getAttribLocation(program, "aInstanceOffset");
           let aInstanceRadiusLoc = gl.getAttribLocation(program, "aInstanceRadius");
           let aInstanceColorLoc = gl.getAttribLocation(program, "aInstanceColor");

          gl.bindBuffer(gl.ARRAY_BUFFER, circleVBO);
          gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0); 
          gl.enableVertexAttribArray(aPositionLoc);

          gl.bindBuffer(gl.ARRAY_BUFFER, offsetVBO);
          gl.vertexAttribPointer(aInstanceOffsetLoc, 2, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(aInstanceOffsetLoc);
          instancingExt.vertexAttribDivisorANGLE(aInstanceOffsetLoc, 1); 

          gl.bindBuffer(gl.ARRAY_BUFFER, radiusVBO);
          gl.vertexAttribPointer(aInstanceRadiusLoc, 1, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(aInstanceRadiusLoc);
          instancingExt.vertexAttribDivisorANGLE(aInstanceRadiusLoc, 1); 
          
          gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
          gl.vertexAttribPointer(aInstanceColorLoc, 3, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(aInstanceColorLoc);
          instancingExt.vertexAttribDivisorANGLE(aInstanceColorLoc, 1); 

          // Make the instanced draw call
          instancingExt.drawArraysInstancedANGLE(gl.TRIANGLE_FAN, 0, circleSegments + 2, instanceCount);

          // Disable instance arrays after use (good practice)
          instancingExt.vertexAttribDivisorANGLE(aInstanceOffsetLoc, 0);
          instancingExt.vertexAttribDivisorANGLE(aInstanceRadiusLoc, 0);
          instancingExt.vertexAttribDivisorANGLE(aInstanceColorLoc, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, null);

          p.resetShader(); // Let p5 reset its state
      }
    };
    
    // --- dataChanged and Mouse Interaction Logic (keep as is) ---
     p.dataChanged = function(data, oldData) {
       if (!canvas || !gl) return; 
       if (data.display == 'none' || parent.$el.parentElement.clientWidth !== p.width || parent.$el.parentElement.clientHeight !== p.height) {
          let target = parent.$el.parentElement;
          let newWidth = target.clientWidth;
          let newHeight = target.clientHeight;
          if (newWidth > 0 && newHeight > 0) {
             p.resizeCanvas(newWidth, newHeight);
             parent.$emit('update:resize-completed'); 
             parent.$emit('update:width', newWidth); 
             parent.$emit('update:height', newHeight); 
          }
       }
       prepareInstanceData(data);
       if (data.download > oldData.download) {
          console.warn("SVG Download is not supported in instanced WebGL mode.");
       }
     };

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
       
       for (let tile of Object.values(parent.data.tiles)) {
         if (tile && tile.mean) {
           let dist_sq = Math.pow(x_tileSpace - tile.mean.x, 2) + Math.pow(y_tileSpace - tile.mean.y, 2);
           let effectiveZoom = Math.max(0.01, parent.data.zoom); 
           let baseRadius = parent.data.dotSizeMult * Math.pow(effectiveZoom, parent.data.dotSizePow) * (preFactor / 5.0);
           let radius_tileSpace = baseRadius / preFactor; 
           
           if (dist_sq < Math.pow(radius_tileSpace, 2)) { 
               if (dist_sq < min_dist_sq) { 
                   min_dist_sq = dist_sq;
                   mySelectedTile = tile;
               }
           }
         }
       }
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
         let mouseDistance = p.dist(p.mouseX, p.mouseY, prevX, prevY);
         let preFactor = parent.data.zoom * Math.min(p.width, p.height) / parent.data.steps; 
         let stepSize = p.max(1, preFactor/10); 
         if (mouseDistance > stepSize) {
            for (let i = 0; i <= mouseDistance; i += stepSize) {
               let cursorX = p.map(i, 0, mouseDistance, p.mouseX, prevX, true);
               let cursorY = p.map(i, 0, mouseDistance, p.mouseY, prevY, true);
               let intermediateTile = getSelectedTile(cursorX, cursorY);
               if (Object.keys(intermediateTile).length > 0) {
                 let tileString = tileToString(intermediateTile);
                 if (!recentlySelectedTiles.includes(tileString)) {
                   updateSelectedTiles(intermediateTile, adding);
                   recentlySelectedTiles.push(tileString);
                 }            
               }
             }
           }
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