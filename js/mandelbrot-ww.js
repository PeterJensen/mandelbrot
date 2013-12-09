// Mandelbrot using SIMD and Webworkers
// Author: Peter Jensen, Intel Corporation

// global variables
var animate        = false;
var use_simd       = false;
var max_iterations = 100;

// logging operations
var logger = {
  msg: function (msg) {
    console.log (msg);
  }
}    

// Basic canvas operations
var canvas = function () {

  var _ctx;
  var _width;
  var _height;

  var _image_data;

  function init(canvas_id) {
    var $canvas = $(canvas_id);
    _ctx = $canvas.get(0).getContext("2d");
    _width = $canvas.width();
    _height = $canvas.height();
    _image_data = _ctx.getImageData(0, 0, _width, _height);
  }

  function clear() {
    for (var i = 0; i < _image_data.data.length; i = i + 4) {
      _image_data.data[i] = 0;
      _image_data.data[i + 1] = 0;
      _image_data.data[i + 2] = 0;
      _image_data.data[i + 3] = 255;
    }
  }

  function update() {
    _ctx.putImageData(_image_data, 0, 0);
  }

  function updateFromImageData(image_data) {
    _image_data.data.set(image_data);
    _ctx.putImageData(_image_data, 0, 0);
  }

  function setPixel(x, y, rgb) {
    var index = 4 * (x + _width * y);
    _image_data.data[index] = rgb[0];
    _image_data.data[index + 1] = rgb[1];
    _image_data.data[index + 2] = rgb[2];
    _image_data.data[index + 3] = 255;
  }

  function colorMap(value) {
    if (value === max_iterations) {
      return [0, 0, 0];
    }
    var rgb = (value * 0xffff / max) * 0xff;
    var red = rgb & 0xff;
    var green = (rgb >> 8) & 0xff;
    var blue = (rgb >> 16) & 0xff;
    return [red, green, blue];
  }

  function mapColorAndSetPixel(x, y, value) {
    var rgb, r, g, b;
    var index = 4 * (x + _width * y);
    if (value === max_iterations) {
      r = 0;
      g = 0;
      b = 0;
    }
    else {
      rgb = (value * 0xffff / max_iterations) * 0xff;
      r = rgb & 0xff;
      g = (rgb >> 8) & 0xff;
      b = (rgb >> 16) & 0xff;
    }
    _image_data.data[index] = r;
    _image_data.data[index + 1] = g;
    _image_data.data[index + 2] = b;
    _image_data.data[index + 3] = 255;
  }

  function getWidth() {
    return _width;
  }

  function getHeight() {
    return _height;
  }

  return {
    init:                init,
    clear:               clear,
    update:              update,
    updateFromImageData: updateFromImageData,
    setPixel:            setPixel,
    getWidth:            getWidth,
    getHeight:           getHeight,
    colorMap:            colorMap,
    mapColorAndSetPixel: mapColorAndSetPixel
  }

} ();

function animateMandelbrot () {
  var scale_start = 1.0;
  var scale_end   = 0.0005;
  var xc_start    = -0.5;
  var yc_start    = 0.0;
  var xc_end      = 0.0;
  var yc_end      = 0.75;
  var steps       = 200.0;
  var scale_step  = (scale_end - scale_start)/steps;
  var xc_step     = (xc_end - xc_start)/steps;
  var yc_step     = (yc_end - yc_start)/steps;
  var scale       = scale_start;
  var xc          = xc_start;
  var yc          = yc_start;
  var i           = 0;
  var now         = performance.now();

  var worker1 = new Worker('mandelbrot-worker.js');
  var worker2 = new Worker('mandelbrot-worker.js');
  var worker3 = new Worker('mandelbrot-worker.js');
  var workers = [worker1, worker2, worker3];
  
  var buffer1 = new Uint8ClampedArray(canvas.getWidth() * canvas.getHeight() * 4);
  var buffer2 = new Uint8ClampedArray(canvas.getWidth() * canvas.getHeight() * 4);
  var buffer3 = new Uint8ClampedArray(canvas.getWidth() * canvas.getHeight() * 4);
  var buffers = [buffer1, buffer2, buffer3];
  
  worker1.addEventListener('message', updateFrame, false);
  worker2.addEventListener('message', updateFrame, false);

  function requestFrame(worker_index) {
    workers[worker_index].postMessage(
      { width:          canvas.getWidth(),
        height:         canvas.getHeight(),
        xc:             xc,
        yc:             yc,
        scale:          scale,
        use_simd:       use_simd,
        max_iterations: max_iterations,
        worker_index:   worker_index,
        buffer:         buffers[worker_index].buffer
      },
      [buffers[worker_index].buffer]);
  }

  function updateFrame(e) {
    var worker_index = e.data.worker_index;
    buffers[worker_index] = new Uint8ClampedArray (e.data.buffer);
    canvas.updateFromImageData(buffers[worker_index]);
    
    if (!animate) {
      return;
    }
    if (scale < scale_end || scale > scale_start) {
      scale_step = -scale_step;
      xc_step = -xc_step;
      yc_step = -yc_step;
    }
    scale += scale_step;
    xc += xc_step;
    yc += yc_step;
    i++;
    if (((i % 10)|0) === 0) {
      var t = performance.now();
      update_fps (10000/(t - now));
      now = t;
    }
    requestFrame (e.data.worker_index);
  }

  requestFrame(0);
  requestFrame(1);
  requestFrame(2);
}

function update_fps (fps) {
  var $fps = $("#fps");
  $fps.text (fps.toFixed(1));
}

// input click handlers

function start() {
  animate = true;
  animateMandelbrot ();
}

function stop() {
  animate = false;
}

function simd() {
  logger.msg("use SIMD clicked");
  var $simd = $("#simd");
  var $info = $("#info");
  if (!use_simd) {
    use_simd = true;
    $simd.text("Don't use SIMD");
    $info.text("SIMD");
  }
  else {
    use_simd = false;
    $simd.text("Use SIMD");
    $info.text("No SIMD");
  }
}

function main () {
  logger.msg ("main()");
  canvas.init ("#mandel");
  canvas.clear ();
  canvas.update ();
  $("#start").click (start);
  $("#stop").click (stop);
  $("#simd").click (simd);
  //animateMandelbrot ();
}

$(main);
