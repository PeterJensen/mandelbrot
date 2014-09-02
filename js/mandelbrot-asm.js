// Mandelbrot using SIMD
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
  
  function init (canvas_id) {
    var $canvas = $(canvas_id);
    _ctx        = $canvas.get(0).getContext("2d");
    _width      = $canvas.width();
    _height     = $canvas.height();
    _image_data = _ctx.getImageData (0, 0, _width, _height);
  }
  
  function clear () {
    for (var i = 0; i < _image_data.data.length; i = i + 4) {
      _image_data.data [i] = 0;
      _image_data.data [i+1] = 0;
      _image_data.data [i+2] = 0;
      _image_data.data [i+3] = 0;
    }
  }
  
  function update () {
    _ctx.putImageData (_image_data, 0, 0);
  }
  
  function setPixel (x, y, rgb) {
    var index = 4*(x + _width*y);
    _image_data.data[index]   = rgb[0];
    _image_data.data[index+1] = rgb[1];
    _image_data.data[index+2] = rgb[2];
    _image_data.data[index+3] = 255;
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

  function setPixel2 (index, r, g, b) {
    _image_data.data[index]   = r;
    _image_data.data[index+1] = g;
    _image_data.data[index+2] = b;
    _image_data.data[index+3] = 255;
  }

  function mapColorAndSetPixel (x, y, value) {
    var rgb, r, g, b;
    var index = 4*(x + _width*y);
    if (value === max_iterations) {
      r = 0;
      g = 0;
      b = 0;
    }
    else {
      rgb = ((Math.imul(value, 0xffff) >>> 0)/max_iterations) *0xff;
      r = rgb & 0xff;
      g = (rgb >> 8) & 0xff;
      b = (rgb >> 16) & 0xff;
    }
    setPixel2(index, r, g, b);
  }

  function getWidth () {
    return _width;
  }
  
  function getHeight () {
    return _height;
  }
  
  return {
    init:                init,
    clear:               clear,
    update:              update,
    setPixel:            setPixel,
    getWidth:            getWidth,
    getHeight:           getHeight,
    colorMap:            colorMap,
    setPixel2:           setPixel2,
    mapColorAndSetPixel: mapColorAndSetPixel
  }

}();

function asmjsModuleX4(global, imp) {
  "use asm";
  if (typeof SIMD === "undefined") {
    return null;
  }

  var setPixel2 = imp.setPixel2;
  var toF = global.Math.fround;
  var i4 = global.SIMD.int32x4;
  var f4 = global.SIMD.float32x4;
  var i4add = i4.add;
  var i4and = i4.and;
  var f4add = f4.add;
  var f4sub = f4.sub;
  var f4mul = f4.mul;
  var f4lessThanOrEqual = f4.lessThanOrEqual
  const max_iterations = 100;
  var imul=global.Math.imul;

  function mandelx4(xf, yf, yd) {
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    var c_re4  = f4(0.0,0.0,0.0,0.0);
    var c_im4  = f4(0.0,0.0,0.0,0.0);
    var z_re4  = f4(0.0,0.0,0.0,0.0);
    var z_im4  = f4(0.0,0.0,0.0,0.0);
    var four4  = f4(4.0,4.0,4.0,4.0);
    var two4   = f4(2.0,2.0,2.0,2.0);
    var count4 = i4(0,0,0,0);
    var one4   = i4(1,1,1,1);
    var z_re24 = f4(0.0,0.0,0.0,0.0);
    var z_im24 = f4(0.0,0.0,0.0,0.0);
    var new_re4 = f4(0.0,0.0,0.0,0.0);
    var new_im4 = f4(0.0,0.0,0.0,0.0);
    var i = 0;
    var mi4 = i4(0,0,0,0);

    c_re4 = f4(xf, xf, xf, xf);
    c_im4 = f4(yf, toF(yd + yf), toF(yd + toF(yd + yf)), toF(yd + toF(yd + toF(yd + yf))));
    
    z_re4  = c_re4;
    z_im4  = c_im4;

    for (i = 0; (i | 0) < (max_iterations | 0); i = (i + 1) | 0) {
      z_re24 = f4mul(z_re4, z_re4);
      z_im24 = f4mul(z_im4, z_im4);

      mi4 = f4lessThanOrEqual(f4add(z_re24, z_im24), four4);
      // If all 4 values are greater than 4.0, there's no reason to continue.
      if ((mi4.signMask | 0) == 0x00)
      break;

      new_re4 = f4sub(z_re24, z_im24);
      new_im4 = f4mul(f4mul(two4, z_re4), z_im4);
      z_re4   = f4add(c_re4, new_re4);
      z_im4   = f4add(c_im4, new_im4);
      count4  = i4add(count4, i4and(mi4, one4));
    }
    return i4(count4);
  }

  function mapColorAndSetPixel (x, y, _width, value) {
    x = x | 0;
    y = y | 0;
    _width = _width | 0;
    value = value | 0;
    var rgb = 0, r = 0, g = 0, b = 0;;
    var index = 0;
    index = (((imul((_width >>> 0), (y >>> 0)) + x) | 0) * 4) | 0;
    if ((value | 0) == (max_iterations | 0)) {
      r = 0;
      g = 0;
      b = 0;
    }
    else {
      rgb = ~~toF(toF(toF(toF(value >>> 0) * toF(0xffff >>> 0)) / toF(max_iterations >>> 0)) * toF(0xff >>> 0));
      r = rgb & 0xff;
      g = (rgb >>> 8) & 0xff;
      b = (rgb >>> 16) & 0xff;
    }
    setPixel2(index | 0, r | 0, g | 0, b |0);
  }
    
  function mandelx4Column(x, height, _width, xf, yf, yd) {
    x = x | 0;
    height = height | 0;
    _width = _width | 0;
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    var y = 0;
    var ydx4 = toF(0)
    var m4 = i4(0,0,0,0);
    ydx4 = toF(yd * toF(4.0));
    for (y = 0; (y | 0) < (height | 0); y = (y + 4) | 0) {
      m4   = i4(mandelx4(toF(xf), toF(yf), toF(yd)));
      mapColorAndSetPixel(x | 0, y | 0,   _width, m4.x);
      mapColorAndSetPixel(x | 0, (y + 1) | 0, _width, m4.y);
      mapColorAndSetPixel(x | 0, (y + 2) | 0, _width, m4.z);
      mapColorAndSetPixel(x | 0, (y + 3) | 0, _width, m4.w);
      yf = toF(yf + ydx4);
    }
  }

  return mandelx4Column;
}

var mandelx4Column = asmjsModuleX4(this, {setPixel2: canvas.setPixel2});

function asmjsModuleX1(global, imp) {
  "use asm";
  var setPixel2 = imp.setPixel2;
  var toF  = global.Math.fround;
  if (typeof toF === "undefined") toF = function(x) { return x;};
  const max_iterations = 100;
  var imul = global.Math.imul;

  function mandelx1(xf, yf, yd) {
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    var z_re  = toF(0.0);
    var z_im  = toF(0.0);
    var count = 0;
    var z_re2 = toF(0.0);
    var z_im2 = toF(0.0);
    var new_re = toF(0.0);
    var new_im = toF(0.0);
    var i = 0;
    var mi = 0;

    z_re  = xf;
    z_im  = yf;

    for (i = 0; (i | 0) < (max_iterations | 0); i = (i + 1) | 0) {
      z_re2 = toF(z_re * z_re);
      z_im2 = toF(z_im * z_im);

      if (toF(z_re2 + z_im2) > toF(4.0))
      break;

      new_re = toF(z_re2 - z_im2);
      new_im = toF(toF(z_re * toF(2.0)) * z_im);
      z_re   = toF(xf + new_re);
      z_im   = toF(yf + new_im);
      count  = (count + 1) | 0;
    }
    return count | 0;
  }

  function mapColorAndSetPixel (x, y, _width, value) {
    x = x | 0;
    y = y | 0;
    _width = _width | 0;
    value = value | 0;
    var rgb = 0, r = 0, g = 0, b = 0;;
    var index = 0;
    index = (((imul((_width >>> 0), (y >>> 0)) + x) | 0) * 4) | 0;
    if ((value | 0) == (max_iterations | 0)) {
      r = 0;
      g = 0;
      b = 0;
    }
    else {
      rgb = ~~toF(toF(toF(toF(value >>> 0) * toF(0xffff >>> 0)) / toF(max_iterations >>> 0)) * toF(0xff >>> 0));
      r = rgb & 0xff;
      g = (rgb >>> 8) & 0xff;
      b = (rgb >>> 16) & 0xff;
    }
    setPixel2(index | 0, r | 0, g | 0, b |0);
  }
    
  function mandelx1Column(x, height, _width, xf, yf, yd) {
    x = x | 0;
    height = height | 0;
    _width = _width | 0;
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    var y = 0;
    var m4 = 0;
    for (y = 0; (y | 0) < (height | 0); y = (y + 1) | 0) {
      m4   = mandelx1(toF(xf), toF(yf), toF(yd)) | 0;
      mapColorAndSetPixel(x | 0, y | 0,   _width, m4);
      yf = toF(yf + yd);
    }
  }

  return mandelx1Column;
}

var mandelx1Column = asmjsModuleX1(this, {setPixel2: canvas.setPixel2});

function drawMandelbrot (width, height, xc, yc, scale, use_simd) {
  var x0 = xc - 1.5*scale;
  var y0 = yc - scale;
  var xd = (3.0*scale)/width;
  var yd = (2.0*scale)/height;
  
  logger.msg ("drawMandelbrot(xc:" + xc + ", yc:" + yc + ")");

  var xf = x0;
  for (var x = 0; x < width; ++x) {
    var yf = y0;
    if (use_simd) {
      mandelx4Column(x, height, width, xf, yf, yd);
    }
    else {
      mandelx1Column(x, height, width, xf, yf, yd);
    }
    xf += xd;
  }
  canvas.update ();
}

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

  function draw1 () {
    if (animate) {
      setTimeout (draw1, 1);
    }
    drawMandelbrot (canvas.getWidth(), canvas.getHeight(), xc, yc, scale, use_simd);
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
  }  

  draw1 ();
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
  if (typeof SIMD === "undefined") {
    $("#simd").addClass("btn-disable");
  }
  else {
    $("#simd").click (simd);
  }
  animateMandelbrot ();
}

$(main);
