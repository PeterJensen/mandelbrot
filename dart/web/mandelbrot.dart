// Mandelbrot using SIMD.  Dart implementation
// Author: Peter Jensen, Intel Corporation

import 'dart:html';
import 'dart:async';
import 'dart:typed_data';

// global variables
bool animate  = true;
bool use_simd = false;

// logging operations
class Logger {
  static void msg(String msg) {
    print (msg);
  }
}
  
class Canvas {

  CanvasRenderingContext2D _ctx;
  int                      _width;
  int                      _height;
  ImageData                _image_data;
  
  void init (String canvas_id) {
    CanvasElement canvas = query(canvas_id);
    _ctx        = canvas.context2D;
    _width      = canvas.width;
    _height     = canvas.height;
    _image_data = _ctx.getImageData (0, 0, _width, _height);
  }
  
  void clear () {
    for (int i = 0; i < _image_data.data.length; i = i + 4) {
      _image_data.data [i]   = 0;
      _image_data.data [i+1] = 0;
      _image_data.data [i+2] = 0;
      _image_data.data [i+3] = 0;
    }
  }
  
  void update () {
    _ctx.putImageData (_image_data, 0, 0);
  }
  
  void setPixel (int x, int y, List<int> rgb) {
    int index = 4*(x + _width*y);
    _image_data.data[index]   = rgb[0];
    _image_data.data[index+1] = rgb[1];
    _image_data.data[index+2] = rgb[2];
    _image_data.data[index+3] = 255;
  }
  
 static  List<int> colorMap (int value, int max) {
    if (value == max) {
      return [0,0,0];
    }
    int rgb = (value*0xffff ~/ max)*0xff;
    int red   = rgb & 0xff;
    int green = (rgb >> 8) & 0xff;
    int blue  = (rgb >> 16) & 0xff;
    return [red, green, blue];
  }

  int getWidth () {
    return _width;
  }
  
  int getHeight () {
    return _height;
  }
}

Canvas canvas = new Canvas();

int mandelx1 (double c_re, double c_im, int max_iterations) {
  double z_re = c_re;
  double z_im = c_im;
  int    i;
  for (i = 0; i < max_iterations; i++) {
    double z_re2 = z_re*z_re;
    double z_im2 = z_im*z_im;
    if (z_re2 + z_im2 > 4.0)
      break;

    double new_re = z_re2 - z_im2;
    double new_im = 2.0 * z_re * z_im;
    z_re = c_re + new_re;
    z_im = c_im + new_im;
  }
  return i;
}

Int32x4 one4    = new Int32x4(1, 1, 1, 1);

Int32x4 mandelx4(Float32x4 c_re4, Float32x4 c_im4, int max_iterations) {
  Float32x4 z_re4  = c_re4;
  Float32x4 z_im4  = c_im4;
  Float32x4 four4  = new Float32x4.splat (4.0);
  Float32x4 two4   = new Float32x4.splat (2.0);
  
  // Note: the .bool constructor is faster than using the default one.
  Int32x4 count4  = new Int32x4.bool(false, false, false, false);
  // Note: trick to force one4 to be unboxed
  one4 = one4 + count4;

  for (int i = 0; i < max_iterations; ++i) {
    Float32x4 z_re24 = z_re4 * z_re4;
    Float32x4 z_im24 = z_im4 * z_im4;
    Int32x4 mi4    = (z_re24 + z_im24).lessThan (four4);
    bool done = mi4.signMask == 0x0;
    if (done) {
      break;
    }
    Float32x4 new_re4 = z_re24 - z_im24;
    Float32x4 new_im4 = two4 * z_re4 * z_im4;
    z_re4 = c_re4 + new_re4;
    z_im4 = c_im4 + new_im4;
    Int32x4 add01 = mi4 & one4;
    count4 = count4 + add01;
  }
  return count4;
}

void drawMandelbrot (int width, int height, int iterations, double xc, double yc, double scale, bool use_simd) {
  double x0 = xc - 1.5*scale;
  double y0 = yc - scale;
  double xd = (3.0*scale)/width;
  double yd = (2.0*scale)/height;
  
  Logger.msg ("drawMandelbrot(xc: ${xc}, yc: ${yc})");

  double xf = x0;
  for (int x = 0; x < width; ++x) {
    double yf = y0;
    if (use_simd) {
      double ydx4 = 4*yd;
      for (int y = 0; y < height; y += 4) {
        Float32x4 xf4 = new Float32x4.splat(xf);
        Float32x4 yf4 = new Float32x4(yf, yf+yd, yf+yd+yd, yf+yd+yd+yd);
        Int32x4 m4   = mandelx4 (xf4, yf4, iterations);
        canvas.setPixel (x, y,   Canvas.colorMap (m4.x, iterations));
        canvas.setPixel (x, y+1, Canvas.colorMap (m4.y, iterations));
        canvas.setPixel (x, y+2, Canvas.colorMap (m4.z, iterations));
        canvas.setPixel (x, y+3, Canvas.colorMap (m4.w, iterations));
        yf += ydx4;
      }
    }
    else {
      for (int y = 0; y < height; ++y) {
        var m = mandelx1 (xf, yf, iterations);
        canvas.setPixel (x, y, Canvas.colorMap (m, iterations));
        yf += yd;
      }
    }
    xf += xd;
  }
  canvas.update ();
}

void update_fps (fps) {
  Element fps_elem = query("#fps");
  fps_elem.innerHtml = fps.toStringAsFixed(1);
}

void animateMandelbrot () {
  double scale_start = 1.0;
  double scale_end   = 0.0005;
  double xc_start    = -0.5;
  double yc_start    = 0.0;
  double xc_end      = 0.0;
  double yc_end      = 0.75;
  double steps       = 200.0;
  double scale_step  = (scale_end - scale_start)/steps;
  double xc_step     = (xc_end - xc_start)/steps;
  double yc_step     = (yc_end - yc_start)/steps;
  double scale       = scale_start;
  double xc          = xc_start;
  double yc          = yc_start;
  int i              = 0;
  double now         = window.performance.now();

  void draw1 () {
    drawMandelbrot (canvas.getWidth(), canvas.getHeight(), 100, xc, yc, scale, use_simd);
    if (scale < scale_end || scale > scale_start) {
      scale_step = -scale_step;
      xc_step = -xc_step;
      yc_step = -yc_step;
    }
    scale += scale_step;
    xc += xc_step;
    yc += yc_step;
    i++;
    if ((i % 10) == 0) {
      var t = window.performance.now();
      update_fps (10000/(t - now));
      now = t;
    }
    if (animate) {
      var future = new Future.delayed(const Duration(milliseconds: 1), draw1);
    }
  }
  
  draw1 ();
}

// Event handlers for user input

void start(MouseEvent e) {
  animate = true;
  animateMandelbrot ();
}

void stop(MouseEvent e) {
  animate = false;
}

void simd(MouseEvent e) {
  InputElement simd_elem = query("#simd");
  Element info_elem = query("#info");
  if (simd_elem.value == "Use SIMD") {
    use_simd = true;
    simd_elem.value = "Don't use SIMD";
    info_elem.text = "Using SIMD";
  }
  else {
    use_simd = false;
    simd_elem.value = "Use SIMD";
    info_elem.text = "Not using SIMD";
  }
}

main () {
  Logger.msg("hello");
  query("#start").onClick.listen (start);
  query("#stop").onClick.listen (stop);
  query("#simd").onClick.listen (simd);
  
  canvas.init("#mandel");
  canvas.clear();
  canvas.update();
  animateMandelbrot ();
}
