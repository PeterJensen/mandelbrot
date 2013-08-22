// ------------------------------------------------------------------
// Mandelbrot experiments
// Author: Peter Jensen
// ------------------------------------------------------------------

#include <windows.h>
#include <opencv2/core/core.hpp>
#include <opencv2/highgui/highgui.hpp>
#include <dvec.h>
#include <fvec.h>

#define WIDTH  600
#define HEIGHT 400

using namespace cv;

// functions from mandel.cpp
extern int      mandel_1(float    c_re,  float    c_im,  int max_iterations);
extern Iu32vec4 mandel_4(F32vec4 &c_re4, F32vec4 &c_im4, int max_iterations);

static void set_pixel (Mat &img, int x, int y, Vec3b &pixel) {
  img.at<Vec3b>(y, x) = pixel;
}

static Vec3b color_map (int v, int scale) {
  if (v == scale) {
    Vec3b black(0,0,0);
    return black;
  }
  int rgb   = (v*0xffff/scale) * 0xff;
  int red   = rgb & 0xff;
  int blue  = (rgb >> 8) & 0xff;
  int green = (rgb >> 16) & 0xff;
  Vec3b color(red, green, blue);
  return color;
}

static void put_text (Mat &img, char *text, int cx, int cy) {
  double fontscale = 1.5;
  int    thickness = 4;
  Size textsize = getTextSize(text, FONT_HERSHEY_COMPLEX, fontscale, thickness, 0);
  Point org(cx - textsize.width/2,cy+textsize.height/2);
  int lineType = 8;
  putText(img, text, org, FONT_HERSHEY_COMPLEX, fontscale,
          Scalar(255, 255, 255), thickness, lineType );
}

void draw_mandelbrot (Mat &img, int iterations, float xc, float yc, float scale, bool use_simd) {
  float x0 = xc - 1.5f*scale;
  float y0 = yc - scale;
  float xd = (3.0f*scale)/(float)WIDTH;
  float yd = (2.0f*scale)/(float)HEIGHT;

  float xf = x0;
  for (int x = 0; x < WIDTH; ++x) {
    float yf = y0;
    if (use_simd) {
      float ydx4 = yd+yd+yd+yd;
      for (int y = 0; y < HEIGHT; y += 4) {
        F32vec4  xf4(xf, xf, xf, xf);
        F32vec4  yf4(yf, yf+yd, yf+yd+yd, yf+yd+yd+yd);
        Iu32vec4 m4 = mandel_4 (xf4, yf4, iterations);
        set_pixel (img, x, y,   color_map (m4[3], iterations));
        set_pixel (img, x, y+1, color_map (m4[2], iterations));
        set_pixel (img, x, y+2, color_map (m4[1], iterations));
        set_pixel (img, x, y+3, color_map (m4[0], iterations));
        yf += ydx4;
      }
    }
    else {
//#pragma simd
      for (int y = 0; y < HEIGHT; ++y) {
        int m = mandel_1 (xf, yf, iterations);
        set_pixel (img, x, y, color_map (m, iterations));
        yf += yd;
      }
    }
    xf += xd;
  }

  if (use_simd) {
    put_text (img, "SIMD", WIDTH/2, 30);
  }
  else {
    put_text (img, "NO SIMD", WIDTH/2, 30);
  }
}

int main(int argc, char *argv[]){

  bool use_simd = false;

  // Windows names
  char mandelbrot_window[] = "MandelBrot";

  if (argc != 1) {
    use_simd = true;
  }

  // Create black empty image
  Mat mandelbrot_image = Mat::zeros(HEIGHT, WIDTH, CV_8UC3 );

  float scale_start = 1.0f;
  float scale_end   = 0.0005f;
  float xc_start    = -0.5f;
  float yc_start    = 0.0f;
  float xc_end      = 0.0f;
  float yc_end      = 0.75f;
  float steps       = 200.0f;
  float scale_step  = (scale_end - scale_start)/steps;
  float xc_step     = (xc_end - xc_start)/steps;
  float yc_step     = (yc_end - yc_start)/steps;
  float scale       = scale_start;
  float xc          = xc_start;
  float yc          = yc_start;
  double fps        = 0.0;

  DWORD ms_ticks    = GetTickCount();
  for (int i = 0; ;++i) {
    printf ("Iteration: %d\n", i);
    
    // Add the mandelbrot image
    draw_mandelbrot (mandelbrot_image, 100, xc, yc, scale, use_simd);
  
    // Compute the FPS avaraged over the last 10 draws
    if ((i > 0) && (i % 10 == 0)) {
      ms_ticks = GetTickCount() - ms_ticks;    
      fps = 10000.0/((double)ms_ticks);
      ms_ticks = GetTickCount();
    }
    char sbuf[100];
    sprintf (sbuf, "FPS: %.1f", fps);
    put_text (mandelbrot_image, sbuf, WIDTH/2, HEIGHT-30);

    // Show the resulting image
    imshow(mandelbrot_window, mandelbrot_image );
    if (waitKey (1) == 0x20) {
      use_simd = !use_simd;
    }
    if (scale < scale_end || scale > scale_start) {
      scale_step = -scale_step;
      xc_step = -xc_step;
      yc_step = -yc_step;
    }
    scale += scale_step;
    xc += xc_step;
    yc += yc_step;
  }

  waitKey( 0 );
  return(0);
}
