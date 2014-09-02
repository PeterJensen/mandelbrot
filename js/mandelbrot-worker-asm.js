self.addEventListener ("message", computeFrame, false);

var max_iterations;
var image_buffer;
var width;
var heigth;

function computeFrame (e) {
  if (typeof e.data.terminate !== "undefined") {
    self.close ();
    return;
  } 
  var message = e.data.message;
  max_iterations = message.max_iterations;
  image_buffer = new Uint8ClampedArray (e.data.buffer);
  width        = message.width;
  height       = message.height;
  drawMandelbrot (message);
  self.postMessage ({worker_index: e.data.worker_index, message: message, buffer: e.data.buffer}, [e.data.buffer]);
//   self.postMessage ({worker_index: e.data.worker_index, buffer: e.data.buffer});
}

function mandelx1 (c_re, c_im) {
  var z_re = c_re,
      z_im = c_im,
      i;
  for (i = 0; i < max_iterations; i++) {
    var z_re2 = z_re*z_re;
    var z_im2 = z_im*z_im;
    if (z_re2 + z_im2 > 4.0)
      break;

    var new_re = z_re2 - z_im2;
    var new_im = 2.0 * z_re * z_im;
    z_re = c_re + new_re;
    z_im = c_im + new_im;
  }
  return i;
}

function mandelx4(c_re4, c_im4) {
  var z_re4  = c_re4;
  var z_im4  = c_im4;
  var four4  = SIMD.float32x4.splat (4.0);
  var two4   = SIMD.float32x4.splat (2.0);
  var count4 = SIMD.int32x4.splat (0);
  var one4   = SIMD.int32x4.splat (1);

  for (var i = 0; i < max_iterations; ++i) {
    var z_re24 = SIMD.float32x4.mul (z_re4, z_re4);
    var z_im24 = SIMD.float32x4.mul (z_im4, z_im4);

    var mi4    = SIMD.float32x4.lessThanOrEqual (SIMD.float32x4.add (z_re24, z_im24), four4);
    // if all 4 values are greater than 4.0, there's no reason to continue
    if (mi4.signMask === 0x00) {
      break;
    }

    var new_re4 = SIMD.float32x4.sub (z_re24, z_im24);
    var new_im4 = SIMD.float32x4.mul (SIMD.float32x4.mul (two4, z_re4), z_im4);
    z_re4       = SIMD.float32x4.add (c_re4, new_re4);
    z_im4       = SIMD.float32x4.add (c_im4, new_im4);
    count4      = SIMD.int32x4.add (count4, SIMD.int32x4.and (mi4, one4));
  }
  return count4;
}

function mapColorAndSetPixel (x, y, value) {
  var rgb, r, g, b;
  var index = 4*(x + width*y);
  if (value === max_iterations) {
    r = 0;
    g = 0;
    b = 0;
  }
  else {
    rgb = (value*0xffff/max_iterations)*0xff;
    r = rgb & 0xff;
    g = (rgb >> 8) & 0xff;
    b = (rgb >> 16) & 0xff;
  }
  image_buffer[index]   = r;
  image_buffer[index+1] = g;
  image_buffer[index+2] = b;
  image_buffer[index+3] = 255;
}

function setPixel2(index, r, g, b) {
  image_buffer[index]   = r;
  image_buffer[index+1] = g;
  image_buffer[index+2] = b;
  image_buffer[index+3] = 255;
}

function asmjsModuleX4(global, imp) {
  "use asm";
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
      // If all 4 values are greater than 4.0, there's no reason to continue
      // if (mi4.signMask === 0x00) {
      //	break;
      // }

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

var mandelx4Column = asmjsModuleX4(this, {setPixel2: setPixel2});

function asmjsModuleX1(global, imp) {
  "use asm";
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

      mi = toF(z_re2 + z_im2) <= toF(4.0) ? 1 : 0;
      // ?? To be fair, might want to disable this early-out.
      // if ((mi | 0) == 0) break;

      // Alternative, and below for the counter:
      // if (toF(z_re2 + z_im2) > toF(4.0)) break;

      new_re = toF(z_re2 - z_im2);
      new_im = toF(toF(z_re * toF(2.0)) * z_im);
      z_re   = toF(xf + new_re);
      z_im   = toF(yf + new_im);
      count  = (count + mi) | 0;
      // Alternative.
      // count  = (count + 1) | 0;
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

var mandelx1Column = asmjsModuleX1(this, {setPixel2: setPixel2});

function drawMandelbrot (params) {
  var width        = params.width;
  var height       = params.height;
  var scale        = params.scale;
  var use_simd     = params.use_simd;
  var xc           = params.xc;
  var yc           = params.yc;
  var x0 = xc - 1.5*scale;
  var y0 = yc - scale;
  var xd = (3.0*scale)/width;
  var yd = (2.0*scale)/height;
  
  var xf = x0;
  for (var x = 0; x < width; ++x) {
    var yf = y0;
    if (use_simd)
    mandelx4Column(x, height, width, xf, yf, yd);
    else
    mandelx1Column(x, height, width, xf, yf, yd);
    xf += xd;
  }
}
