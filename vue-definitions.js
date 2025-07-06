// Defines a Vue <p5> Component

Vue.component('p5', {

  template: '<div></div>',

  props: ['src','data'],

  methods: {
    // loadScript from https://stackoverflow.com/a/950146
    // loads the p5 javscript code from a file
    loadScript: function (url, callback)
    {
      // Adding the script tag to the head as suggested before
      var head = document.head;
      var script = document.createElement('script');
      //script.type = 'text/javascript';
      script.src = url;

      // Then bind the event to the callback function.
      // There are several events for cross browser compatibility.
      script.onreadystatechange = callback;
      script.onload = callback;

      // Fire the loading
      head.appendChild(script);
    },

    loadSketch: function() {
      this.myp5 = new p5(sketch(this));
    }
  },

  data: function() {
    return {
      myp5: {}
    }
  },

  mounted() {
    this.loadScript(this.src, this.loadSketch);
  },

  watch: {
    data: {
      handler: function(val, oldVal) {
        if(this.myp5.dataChanged && this.myp5._setupDone) {
          this.myp5.dataChanged(val, oldVal);
        }
      },
      deep: true
    }
  }

});

// Sets up the main Vue instance

var app = new Vue({
  el: '#root',

  methods: {

    approx(x) {
      return Math.round(x * this.inverseEpsilon) / this.inverseEpsilon;
    },

    dist(x1,y1, x2, y2) {
      let dx = x2 - x1;
      let dy = y2 - y1;
      return Math.sqrt(dx * dx + dy * dy);
    },

    clearSelection() {
      this.selectedTiles = [];
    },

    // from stack exchange https://stackoverflow.com/a/5624139
    rgbToHex(r, g, b) {
      let R = Math.round(r);
      let G = Math.round(g);
      let B = Math.round(b);

      return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    },

    onResize() {
      this.canvas2Resized = false;
    },

    lerp(start, stop, x) {
      return start + x * (stop - start);
    },

    reset() {
      // pressing reset shouldn't change mode, fullscreen & show
      // i.e. it should only reset pattern properties
      this.dataBackup.mode = this.$data.mode;
      this.dataBackup.fullscreen = this.$data.fullscreen;
      this.dataBackup.show = this.$data.show;

      // reset data to backup
      Object.assign(this.$data, this.dataBackup);
      
      // and then recreate the backup, because resetting the data also emptied the backup
      this.dataBackup = JSON.parse(JSON.stringify(this.$data));
    },

    resetSelection() {
      this.selectedTiles = [];
    },

    randomizeColors() {
      this.hue = Math.round(360 * Math.random()); // 0 to 360
      this.hueRange = Math.round(360 * Math.random()) - 180; // -180 to 180
      this.contrast = Math.round(25 * Math.random()) + 25; // 25 to 50
      this.sat = Math.round(40 * Math.random()) + 60; // 60 to 100
    },

    updateURL(queryURL) {

      if (queryURL == '') {
        window.history.replaceState({}, 'Pattern Collider', location.pathname);
      } else {
        window.history.replaceState({}, 'Pattern Collider', '?' + queryURL);
      }

    },

    copyURLToClipboard() {

      const el = document.createElement('textarea');
      el.value = window.location.href;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);

      alert("Link copied to clipboard");
    }, 

    requestFullscreen() {

      if (!this.fullscreen) {
        let el = document.documentElement;

        if (el.requestFullscreen) { // https://www.w3schools.com/jsref/met_element_requestfullscreen.asp
          el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) { /* Safari */
          el.webkitRequestFullscreen();
        }

      } else {

        if (document.exitFullscreen) { // https://www.w3schools.com/jsref/met_element_exitfullscreen.asp
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
          document.webkitExitFullscreen();
        }

      }

    },

    // --- Animation Methods ---
    togglePatternAnimation() {
        this.isAnimatingPattern = !this.isAnimatingPattern;
        if (this.isAnimatingPattern) {
            this.animationPatternPhase = 0; // Reset phase for consistent animation
        }
        this.startOrStopMainAnimationLoop();
    },
    
    toggleDisorderAnimation() {
        this.isAnimatingDisorder = !this.isAnimatingDisorder;
        if (this.isAnimatingDisorder) {
            this.animationDisorderPhase = 0; // Reset phase for consistent animation
        }
        this.startOrStopMainAnimationLoop();
    },
    
    startOrStopMainAnimationLoop() {
        const shouldBeAnimating = this.isAnimatingPattern || this.isAnimatingDisorder;
        
        if (shouldBeAnimating && this.mainAnimationId === null) {
            // Start the loop
            this.lastAnimationTime = performance.now();
            this.mainAnimateLoop(); 
        } else if (!shouldBeAnimating && this.mainAnimationId !== null) {
            // Stop the loop
            cancelAnimationFrame(this.mainAnimationId);
            this.mainAnimationId = null;
        }
    },

    // Smooth triangle wave function that uses cosine for smooth turnarounds
    smoothTriangle(phase) {
        const normalizedPhase = phase % 1; // Keep phase in [0, 1] range
        const x = normalizedPhase * 2 * Math.PI;
        
        // Create a smooth triangle wave using cosine blending at the peaks
        // This avoids discontinuous derivatives at the turning points
        const blendWidth = 0.1; // How much of the cycle to use for smoothing (10%)
        const cyclePos = normalizedPhase * 4; // Position in the full cycle [0, 4]
        
        if (cyclePos < 1 - blendWidth) {
            // Linear up
            return cyclePos;
        } else if (cyclePos < 1 + blendWidth) {
            // Smooth turnaround at top using cosine
            const t = (cyclePos - (1 - blendWidth)) / (2 * blendWidth);
            return (1 - blendWidth) + blendWidth * (1 + Math.cos(Math.PI * t)) / 2;
        } else if (cyclePos < 3 - blendWidth) {
            // Linear down
            return 2 - cyclePos;
        } else if (cyclePos < 3 + blendWidth) {
            // Smooth turnaround at bottom using cosine
            const t = (cyclePos - (3 - blendWidth)) / (2 * blendWidth);
            return -(1 - blendWidth) - blendWidth * (1 + Math.cos(Math.PI * t)) / 2;
        } else {
            // Linear up (completing the cycle)
            return cyclePos - 4;
        }
    },

    mainAnimateLoop() {
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastAnimationTime) / 1000; // Convert to seconds
        this.lastAnimationTime = currentTime;
        
        // --- Animation Parameters ---
        const patternSpeed = 0.005; // Cycles per second (full -1 to 1 to -1 cycle)
        const disorderSpeed = 0.08; // Cycles per second (full 0 to 1 to 0 cycle)
        
        let needsUpdate = false;
        
        // Animate Pattern if active (-1 to 1 range)
        if (this.isAnimatingPattern) {
            this.animationPatternPhase += patternSpeed * 0.032;
            this.pattern = this.smoothTriangle(this.animationPatternPhase);
            needsUpdate = true;
        }

        // Animate Disorder if active (0 to 1 range)
        if (this.isAnimatingDisorder) {
            this.animationDisorderPhase += disorderSpeed * deltaTime;
            // Map the triangle wave from [-1, 1] to [0, 1]
            const triangleValue = this.smoothTriangle(this.animationDisorderPhase);
            const newDisorder = (triangleValue + 1) * 0.5;
            
            // Only update if change is significant
            if (Math.abs(this.disorder - newDisorder) > 0.001) {
                this.disorder = newDisorder;
                needsUpdate = true;
            }
        }

        // Schedule the next frame only if any animation is still active
        if (this.isAnimatingPattern || this.isAnimatingDisorder) {
            this.mainAnimationId = requestAnimationFrame(() => this.mainAnimateLoop());
        } else {
            this.mainAnimationId = null;
        }
    },
    // ------------------------

  },

  computed: {

    offsets() { // dependencies: symmetry, pattern, disorder, randomSeed

      let offsets =  Array(this.symmetry).fill(this.pattern);

      if (this.disorder > 0) {
        let random = new Math.seedrandom('random seed ' + this.symmetry + ' and ' + this.randomSeed);
        offsets = offsets.map(e => e + this.disorder * (random() - 0.5));
      }

      if (this.pan > 0) {
        offsets = offsets.map((e,i) => e - this.steps * this.pan * this.shift[i]);
      }

      return offsets;
    },

    multiplier() { // dependencies: symmetry
      return 2 * Math.PI / this.symmetry;
    },

    steps() {
      // find nearest odd number to radius / (symmetry - 1)
      return 2* Math.round((this.radius / (this.symmetry - 1) - 1)/2) + 1;
    },

    spacing() {
      return this.zoom * Math.min(this.width, this.height) / (this.steps);
    },

    make1Dgrid() {
      const result = new Array(this.steps);
      const half = (this.steps - 1) / 2;
      
      for (let i = 0; i < this.steps; i++) {
        result[i] = i - half;
      }
      
      // Sort by absolute value more efficiently
      return result.sort((a, b) => Math.abs(a) - Math.abs(b));
    },

    grid() { // dependencies: symmetry, steps, multiplier, offsets
      const lines = [];
      const gridValues = this.make1Dgrid;
      
      for (let i = 0; i < this.symmetry; i++) {
        const offset = this.offsets[i] % 1;
        for (let j = 0; j < gridValues.length; j++) {
          // grid is a set of tuples of {angle: angle, index: index} for each grid line
          // TODO fix degeneracy issue: there can be multiple lines that coincide
          lines.push({
            angle: i,
            index: gridValues[j] + offset
          });
        }
      }

      return lines;
    },

    // returns a table with sin & cos values for 2*PI*i/symmetry
    sinCosTable() {  // dependencies: symmetry, multiplier

      let table = [];
  
      for (let i = 0; i < this.symmetry; i++) {
        table.push({
          sin: Math.sin(i * this.multiplier), 
          cos: Math.cos(i * this.multiplier)
        });
      }

      return table;
    },

    sinCosRotate() {

      let angle = this.rotate * Math.PI / 180;

      return { 
        sin: Math.sin(angle),
        cos: Math.cos(angle)
      };

    },

    shift() {
      // use cosine difference formula with lookup tables for optimization
      return this.sinCosTable.map(e => e.cos * this.sinCosRotate.cos - e.sin * this.sinCosRotate.sin);
    },

    intersectionPoints() {

      // calculate intersection points of lines on grid
      let pts = {};
      let linepts = this.grid.map((line) => []);

      if (this.width && this.height) {

        // Pre-calculate frequently used values
        const halfWidth = this.width / 2 + this.spacing;
        const halfHeight = this.height / 2 + this.spacing;
        const maxDistSq = this.steps === 1 ? 0.25 * this.steps * this.steps : 0.25 * (this.steps - 1) * (this.steps - 1);
        const rotationAngle = this.rotate * Math.PI / 180;
        const cosRot = Math.cos(rotationAngle);
        const sinRot = Math.sin(rotationAngle);
        const gridLength = this.grid.length;

        // Use index-based iteration for better performance
        for (let i = 0; i < gridLength; i++) {
          const line1 = this.grid[i];
          const sc1 = this.sinCosTable[line1.angle];
          const s1 = sc1.sin;
          const c1 = sc1.cos;
          
          for (let j = i + 1; j < gridLength; j++) { // Start from i+1 to avoid duplicate checks
            const line2 = this.grid[j];
            
            if (line1.angle >= line2.angle) continue; // Skip if not in correct order
            
            const sc2 = this.sinCosTable[line2.angle];
            const s2 = sc2.sin;
            const c2 = sc2.cos;
            
            const s12 = s1 * c2 - c1 * s2;
            
            // Skip if parallel or near-parallel
            if (Math.abs(s12) <= this.epsilon) continue;
            
            const s12_inv = 1 / s12; // Pre-calculate reciprocal
            const x = (line2.index * s1 - line1.index * s2) * s12_inv;
            const y = (line2.index * c1 - line1.index * c2) * -s12_inv;
            
            // Early distance check before rotation (using squared distance to avoid sqrt)
            const distSq = x * x + y * y;
            if (distSq > maxDistSq) continue;
            
            // Apply rotation
            const xprime = x * cosRot - y * sinRot;
            const yprime = x * sinRot + y * cosRot;
            
            // View bounds check
            if (Math.abs(xprime * this.spacing) > halfWidth || 
                Math.abs(yprime * this.spacing) > halfHeight) continue;
            
            // Use more efficient key generation instead of JSON.stringify
            const keyX = Math.round(x * this.inverseEpsilon);
            const keyY = Math.round(y * this.inverseEpsilon);
            const index = `${keyX},${keyY}`;
            
            if (pts[index]) {
              if (!pts[index].lines.includes(line1)) {
                pts[index].lines.push(line1);
              }
              if (!pts[index].lines.includes(line2)) {
                pts[index].lines.push(line2);
              }
            } else {
              pts[index] = {
                x: x,
                y: y,
                lines: [line1, line2],
                neighbors: {[i]: [], [j]: []},
                idx: index
              };
              linepts[i].push(pts[index]);
              linepts[j].push(pts[index]);
            }
          }
        }
        // Optimize neighbors calculation
        linepts.forEach((line, j) => {
          if (line.length === 0) return; // Skip empty lines
          
          // Sort once and reuse
          const sortedLine = line.sort((a,b) => a.y - b.y);
          const lineLength = sortedLine.length;
          
          sortedLine.forEach((ipt, i) => {
            const prevIdx = Math.max(0, i - 1);
            const nextIdx = Math.min(lineLength - 1, i + 1);
            const prevPt = pts[sortedLine[prevIdx].idx];
            const nextPt = pts[sortedLine[nextIdx].idx];
            
            pts[ipt.idx].neighbors[j].push(
              {x: prevPt.x, y: prevPt.y}, 
              {x: nextPt.x, y: nextPt.y}
            );
          });
        });

        // calculate dual points to intersection points
        for (let pt of Object.values(pts)) {

          // sort angles of all edges that meet at an intersection point
          let angles = pt.lines.map(e => e.angle * this.multiplier);
          let angles2 = angles.map(e => (e + Math.PI) % (2 * Math.PI));
          // numerical sort angles and remove duplicates (e.g. due to degeneracy when phase = 0)
          angles = [...angles, ...angles2].map(e => this.approx(e)).sort((a,b) => a - b).filter((e, i, arr) => arr.indexOf(e) == i);

          // Calculate mean directly without storing dual points
          let mean = {x: 0, y: 0};
          
          // Pre-calculate sin/cos table references
          const sinCosRefs = this.sinCosTable;
          const offsetsRefs = this.offsets;
          const epsilonNeg = -this.epsilon;
          
          // Process each angle pair to create median points and their duals
          const angleCount = angles.length;
          for (let i = 0; i < angleCount; i++) {
            const angle0 = angles[i];
            const angle1 = angles[(i + 1) % angleCount];
            
            // Calculate median point directly
            const xm = pt.x + epsilonNeg * 0.5 * (Math.sin(angle0) + Math.sin(angle1));
            const ym = pt.y + this.epsilon * 0.5 * (Math.cos(angle0) + Math.cos(angle1));
            
            // Calculate dual point and accumulate for mean
            let xd = 0;
            let yd = 0;
            
            for (let j = 0; j < this.symmetry; j++) {
              const cj = sinCosRefs[j].cos;
              const sj = sinCosRefs[j].sin;
              const k = Math.floor(xm * cj + ym * sj - offsetsRefs[j]);
              
              xd += k * cj;
              yd += k * sj;
            }
            
            // Accumulate for mean calculation
            mean.x += xd;
            mean.y += yd;
          }
          
          // Finalize mean
          mean.x /= angleCount;
          mean.y /= angleCount;
          
          pt.numVertices = angles.length;
          pt.angles = JSON.stringify(angles);
          pt.mean = mean;

          // Calculate direction vectors for the first two intersecting lines
          let directions = [];
          if (pt.lines.length >= 2) {
            // Get direction vectors for the first two lines
            for (let i = 0; i < Math.min(2, pt.lines.length); i++) {
              const line = pt.lines[i];
              const sc = this.sinCosTable[line.angle];
              // Apply rotation to the direction vector
              const dirX = sc.cos * this.sinCosRotate.cos - sc.sin * this.sinCosRotate.sin;
              const dirY = sc.cos * this.sinCosRotate.sin + sc.sin * this.sinCosRotate.cos;
              directions.push({x: dirX, y: dirY});
            }
          }
          
          // Ensure we always have two direction vectors (pad with zeros if needed)
          while (directions.length < 2) {
            directions.push({x: 0, y: 0});
          }
          
          pt.directions = directions;

        }        
      }
      
      return pts;

    },

    tiles() {
      // Expose intersection points as tiles for the drawing component
      return this.intersectionPoints;
    },

    colors() {
      let lightness = 50;

      let start = [this.hue + this.hueRange, this.sat, lightness + this.contrast];
      let end = [this.hue - this.hueRange, this.sat, lightness - this.contrast];
      
      return [start, end];
    },

    canvasDisplaySetting() {
      if (this.canvas2Resized) {
        return '';
      } else {
        return 'none';
      }
    },

    queryURL() {
      
      let queryURL = new URLSearchParams();

      for (let parameter of this.urlParameters) {
        let value = JSON.stringify(this.$data[parameter]);
        if (parameter !== 'dataBackup' && value !== JSON.stringify(this.dataBackup[parameter]) && !(parameter == 'randomSeed' && this.$data['disorder'] == 0)) {
          queryURL.append(parameter, value);
        }
      }

      queryURL = queryURL.toString();

      // debounce URL update: only update URL once every 500ms
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.updateURL(queryURL);
      }, 200);

      return queryURL;

    },

  },

  watch: {

    symmetry() {
      this.selectedTiles = [];
    },

    pattern() {
      this.selectedTiles = [];
    },

    radius() {
      this.selectedTiles = [];      
    },

    rotate() {
      this.selectedTiles = [];      
    },

    pan() {
      this.selectedTiles = [];      
    },

    disorder() {
      this.selectedTiles = [];
    },

    randomSeed() {
      this.selectedTiles = [];
    },

    show() {
      this.canvas2Resized = false;
    },

  },

  created() {
    this.dataBackup = JSON.parse(JSON.stringify(this.$data));

    let url = window.location.href.split('?');
    if (url.length > 1) {
      let urlParameters = new URLSearchParams(url[1]);
      for (const [parameter, value] of urlParameters) {
        if (this.urlParameters.includes(parameter)) {
          this.$data[parameter] = JSON.parse(value);
        }
      }      
    }
  },

  mounted() {

    let context = this;

    window.addEventListener("resize", this.onResize);

    setTimeout(() => {
      context.canvas2Resized = false;
    }, 500);


    window.addEventListener("fullscreenchange", e => {
      context.fullscreen = document.fullscreen;
      context.canvas2Resized = false;
    });

    window.addEventListener("webkitfullscreenchange", e => {
      context.fullscreen = document.webkitCurrentFullScreenElement;
      context.canvas2Resized = false;
    });

  },

  data: {
    dataBackup: {},
    // Add caching for intersection points
    urlParameters: ['symmetry', 'pattern', 'pan', 'disorder', 'randomSeed', 'radius', 'zoom', 'rotate', 'colorTiles', 'showIntersections', 'stroke', 'showStroke', 'hue', 'hueRange', 'contrast', 'sat', 'reverseColors', 'orientationColoring', 'dotSizeMult', 'dotSizePow'],
    symmetry: 5,
    radius: 100,
    pattern: 0.2,
    pan: 0,
    disorder: 0,
    randomSeed: 0,
    zoom: 1,
    showIntersections: true,
    colorTiles: true,
    orientationColoring: false,
    stroke: 128,
    showStroke: false,
    rotate: 0,
    hue: 342,
    hueRange: 62,
    contrast: 36,
    sat: 74,
    reverseColors: false,
    show: 'Tiling',
    selectedTiles: [],
    epsilon: Math.pow(10, -6),
    inverseEpsilon: Math.pow(10, 6),
    canvas2Resized: false,
    width: 0,
    height: 0,
    tilingDownloadCount: 0,
    mode: 'shape',
    fullscreen: false,
    fullscreenPossible: document.fullscreenEnabled || document.webkitFullscreenEnabled,
    dotSizeMult: 0.003,
    dotSizePow: 3.85,
    saveKeys: [
      'symmetry', 'steps', 'pattern', 'disorder', 'radius', 'zoom', 
      'colorTiles', 'showIntersections', 'showStroke', 'stroke', 'hue', 'sat', 
      'contrast', 'hueRange', 'reverseColors', 'rotate', 'orientationColoring',
      'randomSeed', 'pan', 
      'dotSizeMult', 'dotSizePow'
    ],
    appDescription: 'Pattern Collider Vue App',
    isAnimatingPattern: false,
    isAnimatingDisorder: false,
    mainAnimationId: null,
    lastAnimationTime: null,
    animationPatternPhase: 0,
    animationDisorderPhase: 0,
  }

});
