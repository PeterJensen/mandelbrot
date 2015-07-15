/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 ; js-indent-level : 2 ; js-curly-indent-offset: 0 -*- */
/* vim: set ts=2 et sw=2 tw=80: */

// Mandelbrot using SIMD
// Author: Peter Jensen, Intel Corporation

// global variables
var animate        = false;
var use_simd       = false;
var max_iterations = 100;

// Polyfill and alerts
if (typeof Math.fround == 'undefined') {
  Math.fround = function(x) { return x };
}
if (typeof SIMD == 'undefined') {
  alert('SIMD not implemented in this browser. SIMD speedup button is disabled');
}

// Asm.js module buffer.
var buffer = new ArrayBuffer(16 * 1024 * 1024);

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

  function update (buffer) {
    var imageData = new Uint8ClampedArray(buffer, 0, _width * _height * 4);
    _image_data.data.set(imageData);
    _ctx.putImageData(_image_data, 0, 0);
  }

  function getWidth () {
    return _width;
  }

  function getHeight () {
    return _height;
  }

  return {
    init:                init,
    update:              update,
    getWidth:            getWidth,
    getHeight:           getHeight,
  }

}();

function asmjsModule (global, imp, buffer) {
  "use asm"
  var b8 = new global.Uint8Array(buffer);
  var toF = global.Math.fround;
  var i4 = global.SIMD.Int32x4;
  var f4 = global.SIMD.Float32x4;
  var i4ext = i4.extractLane;
  var i4add = i4.add;
  var i4and = i4.and;
  var i4check = i4.check;
  var f4add = f4.add;
  var f4sub = f4.sub;
  var f4mul = f4.mul;
  var f4lessThanOrEqual = f4.lessThanOrEqual;
  var f4splat = f4.splat;
  var imul = global.Math.imul;
  const one4 = i4(1,1,1,1), two4 = f4(2,2,2,2), four4 = f4(4,4,4,4);

  const mk0 = 0x007fffff;
  function declareHeapLength() {
    b8[0x00ffffff] = 0;
  }

  function mapColorAndSetPixel (x, y, width, value, max_iterations) {
    x = x | 0;
    y = y | 0;
    width = width | 0;
    value = value | 0;
    max_iterations = max_iterations | 0;

    var rgb = 0, r = 0, g = 0, b = 0, index = 0;

    index = (((imul((width >>> 0), (y >>> 0)) + x) | 0) * 4) | 0;
    if ((value | 0) == (max_iterations | 0)) {
      r = 0;
      g = 0;
      b = 0;
    } else {
      rgb = ~~toF(toF(toF(toF(value >>> 0) * toF(0xffff)) / toF(max_iterations >>> 0)) * toF(0xff));
      r = rgb & 0xff;
      g = (rgb >>> 8) & 0xff;
      b = (rgb >>> 16) & 0xff;
    }
    b8[(index & mk0) >> 0] = r;
    b8[(index & mk0) + 1 >> 0] = g;
    b8[(index & mk0) + 2 >> 0] = b;
    b8[(index & mk0) + 3 >> 0] = 255;
  }

  function mandelPixelX4 (xf, yf, yd, max_iterations) {
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    max_iterations = max_iterations | 0;
    var c_re4  = f4(0,0,0,0), c_im4  = f4(0,0,0,0);
    var z_re4  = f4(0,0,0,0), z_im4  = f4(0,0,0,0);
    var count4 = i4(0,0,0,0);
    var z_re24 = f4(0,0,0,0), z_im24 = f4(0,0,0,0);
    var new_re4 = f4(0,0,0,0), new_im4 = f4(0,0,0,0);
    var i = 0;
    var mi4 = i4(0,0,0,0);

    c_re4 = f4splat(xf);
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
    return i4check(count4);
  }

  function mandelColumnX4 (x, width, height, xf, yf, yd, max_iterations) {
    x = x | 0;
    width = width | 0;
    height = height | 0;
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    max_iterations = max_iterations | 0;

    var y = 0;
    var ydx4 = toF(0);
    var m4 = i4(0,0,0,0);

    ydx4 = toF(yd * toF(4));
    for (y = 0; (y | 0) < (height | 0); y = (y + 4) | 0) {
      m4   = i4check(mandelPixelX4(toF(xf), toF(yf), toF(yd), max_iterations));
      mapColorAndSetPixel(x | 0, y | 0,   width,     i4ext(m4, 0), max_iterations);
      mapColorAndSetPixel(x | 0, (y + 1) | 0, width, i4ext(m4, 1), max_iterations);
      mapColorAndSetPixel(x | 0, (y + 2) | 0, width, i4ext(m4, 2), max_iterations);
      mapColorAndSetPixel(x | 0, (y + 3) | 0, width, i4ext(m4, 3), max_iterations);
      yf = toF(yf + ydx4);
    }
  }

  function mandel (width, height, xc, yc, scale, max_iterations) {
    width = width | 0;
    height = height | 0;
    xc = toF(xc);
    yc = toF(yc);
    scale = toF(scale);
    max_iterations = max_iterations | 0;

    var x0 = toF(0), y0 = toF(0);
    var xd = toF(0), yd = toF(0);
    var xf = toF(0);
    var x = 0;

    x0 = toF(xc - toF(scale * toF(1.5)));
    y0 = toF(yc - scale);
    xd = toF(toF(scale * toF(3)) / toF(width >>> 0));
    yd = toF(toF(scale * toF(2)) / toF(height >>> 0));
    xf = x0;

    for (x = 0; (x | 0) < (width | 0); x = (x + 1) | 0) {
      mandelColumnX4(x, width, height, xf, y0, yd, max_iterations);
      xf = toF(xf + xd);
    }
  }

  return mandel;
}

function nonSimdAsmjsModule (global, imp, buffer) {
  "use asm"
  var b8 = new global.Uint8Array(buffer);
  var toF = global.Math.fround;
  var imul = global.Math.imul;

  const mk0 = 0x007fffff;
  function declareHeapLength() {
    b8[0x00ffffff] = 0;
  }

  function mandelPixelX1 (xf, yf, yd, max_iterations) {
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    max_iterations = max_iterations | 0;

    var z_re  = toF(0), z_im  = toF(0);
    var z_re2 = toF(0), z_im2 = toF(0);
    var new_re = toF(0), new_im = toF(0);
    var count = 0, i = 0, mi = 0;

    z_re  = xf;
    z_im  = yf;

    for (i = 0; (i | 0) < (max_iterations | 0); i = (i + 1) | 0) {
      z_re2 = toF(z_re * z_re);
      z_im2 = toF(z_im * z_im);

      if (toF(z_re2 + z_im2) > toF(4))
        break;

      new_re = toF(z_re2 - z_im2);
      new_im = toF(toF(z_re * toF(2)) * z_im);
      z_re   = toF(xf + new_re);
      z_im   = toF(yf + new_im);
      count  = (count + 1) | 0;
    }
    return count | 0;
  }

  function mapColorAndSetPixel (x, y, width, value, max_iterations) {
    x = x | 0;
    y = y | 0;
    width = width | 0;
    value = value | 0;
    max_iterations = max_iterations | 0;

    var rgb = 0, r = 0, g = 0, b = 0, index = 0;

    index = ((((imul((width >>> 0), (y >>> 0)) | 0) + x) | 0) * 4) | 0;
    if ((value | 0) == (max_iterations | 0)) {
      r = 0;
      g = 0;
      b = 0;
    } else {
      rgb = ~~toF(toF(toF(toF(value >>> 0) * toF(0xffff)) / toF(max_iterations >>> 0)) * toF(0xff));
      r = rgb & 0xff;
      g = (rgb >>> 8) & 0xff;
      b = (rgb >>> 16) & 0xff;
    }
    b8[(index & mk0) >> 0] = r;
    b8[(index & mk0) + 1 >> 0] = g;
    b8[(index & mk0) + 2 >> 0] = b;
    b8[(index & mk0) + 3 >> 0] = 255;
  }

  function mandelColumnX1 (x, width, height, xf, yf, yd, max_iterations) {
    x = x | 0;
    width = width | 0;
    height = height | 0;
    xf = toF(xf);
    yf = toF(yf);
    yd = toF(yd);
    max_iterations = max_iterations | 0;

    var y = 0, m = 0;

    yd = toF(yd);
    for (y = 0; (y | 0) < (height | 0); y = (y + 1) | 0) {
      m = mandelPixelX1(toF(xf), toF(yf), toF(yd), max_iterations) | 0;
      mapColorAndSetPixel(x | 0, y | 0, width, m, max_iterations);
      yf = toF(yf + yd);
    }
  }

  function mandelX1 (width, height, xc, yc, scale, max_iterations) {
    width = width | 0;
    height = height | 0;
    xc = toF(xc);
    yc = toF(yc);
    scale = toF(scale);
    max_iterations = max_iterations | 0;

    var x0 = toF(0), y0 = toF(0), xd = toF(0), yd = toF(0), xf = toF(0);
    var x = 0;

    x0 = toF(xc - toF(scale * toF(1.5)));
    y0 = toF(yc - scale);
    xd = toF(toF(scale * toF(3)) / toF(width >>> 0));
    yd = toF(toF(scale * toF(2)) / toF(height >>> 0));
    xf = x0;

    for (x = 0; (x | 0) < (width | 0); x = (x + 1) | 0) {
      mandelColumnX1(x, width, height, xf, y0, yd, max_iterations);
      xf = toF(xf + xd);
    }
  }

  function mandel (width, height, xc, yc, scale, max_iterations) {
    width = width | 0;
    height = height | 0;
    xc = toF(xc);
    yc = toF(yc);
    scale = toF(scale);
    max_iterations = max_iterations | 0;

    var x0 = toF(0), y0 = toF(0);
    var xd = toF(0), yd = toF(0);
    var xf = toF(0);
    var x = 0;

    x0 = toF(xc - toF(scale * toF(1.5)));
    y0 = toF(yc - scale);
    xd = toF(toF(scale * toF(3)) / toF(width >>> 0));
    yd = toF(toF(scale * toF(2)) / toF(height >>> 0));
    xf = x0;

    for (x = 0; (x | 0) < (width | 0); x = (x + 1) | 0) {
      mandelColumnX1(x, width, height, xf, y0, yd, max_iterations);
      xf = toF(xf + xd);
    }
  }

  return mandel;
}

var HAS_SIMD = typeof SIMD !== 'undefined';
var mandelSimd = (HAS_SIMD && asmjsModule (this, {}, buffer)) || null;
var mandelNonSimd = nonSimdAsmjsModule (this, {}, buffer);

function drawMandelbrot (width, height, xc, yc, scale, use_simd) {
  logger.msg ("drawMandelbrot(xc:" + xc + ", yc:" + yc + ")");
  if (use_simd && HAS_SIMD)
    mandelSimd(width, height, xc, yc, scale, max_iterations);
  else
    mandelNonSimd(width, height, xc, yc, scale, max_iterations);
  canvas.update(buffer);
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
      setTimeout(draw1, 1);
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

  draw1();
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
