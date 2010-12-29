// projections.js
/*
Copyright 2008 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Code to illustrate different LOD'd quadtree projections on the Earth.

// LOD constants
var HORIZONTAL_FOV_RADIANS = 90 * Math.PI / 180;
var HORIZONTAL_PIXELS = 800;
var PROJECTION_CONSTANT = HORIZONTAL_PIXELS
                          / (2 * Math.tan(HORIZONTAL_FOV_RADIANS / 2));
var ERROR_THRESHOLD_PIXELS = 1;

// approximate on-screen feature size (in pixels) = PROJECTION_CONSTANT *
//     geometric_feature_size / geometric_distance_from_camera;

var EARTH_RADIUS = 6378100;  // meters

var TILE_RESOLUTION = 256;
var LINE_ALT = 10000;

// State.
var currentProjectionFolder = null;
var nodeCount = 0;

// Math utilities
// TODO: clean up & move these to math3d.js for re-use.

function cross3d(a, b) {
  return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0] ];
}

function dot3d(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function add3d(a, b) {
  return [
      a[0] + b[0],
      a[1] + b[1],
      a[2] + b[2]];
}

function sub3d(a, b) {
  return [
      a[0] - b[0],
      a[1] - b[1],
      a[2] - b[2]];
}

function scale3d(a, scale) {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}

function length3d(a) {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

function normalize3d(a) {
  var oneOverLen = 1 / length3d(a);
  return scale3d(a, oneOverLen);
}

function bisect3d(a, b) {
  return [(a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          (a[2] + b[2]) / 2];
}

function latLonTo3d(vert) {
  var sinTheta = Math.sin(vert[1] * Math.PI / 180);
  var cosTheta = Math.cos(vert[1] * Math.PI / 180);
  var sinPhi = Math.sin(vert[0] * Math.PI / 180);
  var cosPhi = Math.cos(vert[0] * Math.PI / 180);
  
  var result = [
      EARTH_RADIUS * cosTheta * cosPhi,
      EARTH_RADIUS * sinTheta * cosPhi,
      EARTH_RADIUS * sinPhi ];
  return result;
}

function latLonFrom3d(a) {
  var n = normalize3d(a);
  var lat = Math.asin(n[2]) * 180 / Math.PI;
  if (lat > 90) {
    lat -= 180;
  }
  var lon = 0;
  if (Math.abs(lat) < 90) {
    lon = Math.atan2(n[1], n[0]) * 180 / Math.PI;
  }
  return [lat, lon];
}

// Return the signed perpendicular distance from the point c to the line
// defined by [a, b].
//
// We get the sign by determining if point is to the left of the line,
// from the point of view of looking towards the origin through vert0.
// I.e. is it to the left, looking at the surface of the Earth from
// above.
function leftDistance3d(a, b, c) {
  var ab = sub3d(b, a);
  var ac = sub3d(c, a);
  var cross = cross3d(ab, ac);

  var dot = dot3d(a, cross);
  var lineLength = length3d(ab);
  if (lineLength < 1) {
    return 0;
  }
  var perpendicularDistance = length3d(cross) / lineLength;

  if (dot > 0) {
    return perpendicularDistance;
  } else {
    return -perpendicularDistance;
  }
}

// Return the distance between two 3d points, along the surface of the
// Earth, assuming they are on the surface of the Earth.
function earthDistance3d(a, b) {
  var dot = dot3d(normalize3d(a), normalize3d(b));
  var angle = Math.acos(dot);
  var dist = EARTH_RADIUS * angle;
  return dist;
}

// Projection
//
// A generic Projection type.  This is the base-class for specific
// projections.
//
// Derived classes must override:
//   subdivide(verts,level)
// and if they're not lat/lon based projections, should also override:
//   getViewDistance(verts, level, camLoc)
//   getFeatureSize(verts, level)
//   drawDivisions(subdivision)
//
// Quadtree conventions
//
// Child nodes:
//        +------+------+
//        |      |      |
//        |  0   |  1   |
//        |      |      |
//        +------+------+
//        |      |      |
//        |  2   |  3   |
//        |      |      |
//        +------+------+
//
// Verts:
//        0------1
//        |      |
//        |      |
//        |      |
//        2------3

function Projection() {
}
Projection.prototype.minLevel = 3;
Projection.prototype.maxLevel = 14;

function defaultDisplayNode(proj, verts, level, camLoc) {
  var subdivide;
  if (level < proj.minLevel) {
    subdivide = true;
  }
  if (level >= proj.maxLevel) {
    subdivide = false;
  } else {
    var me = proj;
    var featureSize = me.getFeatureSize(verts, level);
    var distanceToCamera = me.getViewDistance(verts, level, camLoc);
    var estimatedError = 1e6;
    if (distanceToCamera > 0) {
      estimatedError = PROJECTION_CONSTANT * featureSize / distanceToCamera;
    }
    subdivide = estimatedError > ERROR_THRESHOLD_PIXELS;
  }
  
  if (subdivide) {
    var subdivision = me.subdivide(verts, level);
    var center = subdivision.center;
    var top = subdivision.top;
    var bottom = subdivision.bottom;
    var left = subdivision.left;
    var right = subdivision.right;
    
    me.drawDivisions(subdivision);

    // Recurse.
    me.displayNode([verts[0], top, left, center], level + 1, camLoc);  // 0
    me.displayNode([top, verts[1], center, right], level + 1, camLoc);  // 1
    me.displayNode([left, center, verts[2], bottom], level + 1, camLoc);  // 2
    me.displayNode([center, right, bottom, verts[3]], level + 1, camLoc);  // 3
  } else {
    // Do nothing; we're a leaf node.
    nodeCount++;
  }
}

Projection.prototype.displayNode = function(verts, level, camLoc) {
  defaultDisplayNode(this, verts, level, camLoc);
};


// Compute the distance from the camera to the nearest point on the
// quad, in meters.  This is appropriate for Plate-Carree and Mercator
// projections because we assume the quads are alined on lines of
// latitude and longitude; it won't work correctly for a cube-map
// projection.
Projection.prototype.getViewDistance = function(verts, level, camLocation) {
  var dlat0 = verts[2][0] - camLocation[0];
  var dlat1 = verts[0][0] - camLocation[0];
  var dlon0 = verts[0][1] - camLocation[1];
  var dlon1 = verts[1][1] - camLocation[1];

  var nearestLat;
  if (dlat0 < 0) {
    nearestLat = verts[2][0];
  } else if (dlat1 <= 0) {
    nearestLat = camLocation[0];
  } else {
    nearestLat = verts[0][0];
  }

  var nearestLon;
  if (dlon0 < 0) {
    nearestLon = verts[0][1];
  } else if (dlon1 <= 0) {
    nearestLon = camLocation[1];
  } else {
    nearestLon = verts[1][1];
  }

  var a = latLonTo3d([nearestLat, nearestLon]);
  var b = latLonTo3d(camLocation);
  var dist = length3d(sub3d(b, a));
  return dist;
};

Projection.prototype.getFeatureSize = function(verts, level) {
  // Compute the length of our top or bottom boundary that's closest
  // to the equator.
  var minLatitude = Math.min(Math.abs(verts[0][0]), Math.abs(verts[2][0]));
  var cosPhi = Math.cos(minLatitude * Math.PI / 180);
  var lonAngle = Math.abs(verts[1][1] - verts[0][1]);
  // TODO: check this, is it right?
  var lonBoundarySize = cosPhi * (lonAngle * Math.PI / 180) * EARTH_RADIUS;

  // Compute the length of our side boundaries.
  var latAngle = Math.abs(verts[0][0] - verts[2][0]);
  var latBoundarySize = (latAngle * Math.PI / 180) * EARTH_RADIUS;

  var boundarySize = Math.max(lonBoundarySize, latBoundarySize);

  return boundarySize / TILE_RESOLUTION;
};

// Default is appropriate for Mercator and Plate-Carree.
Projection.prototype.drawDivisions = function(subdivision) {
  drawLatLonLine(subdivision.top, subdivision.center);
  drawLatLonLine(subdivision.center, subdivision.bottom);
  drawLatLonLine(subdivision.left, subdivision.center);
  drawLatLonLine(subdivision.center, subdivision.right);
};

// PlateCarree
//
// Straightforward mapping of lat/lon to x/y.

function PlateCarreeProjection() {
}
PlateCarreeProjection.prototype = new Projection();

PlateCarreeProjection.prototype.subdivide = function(verts, level) {
  var result = {};

  // Longitude: just split in half.
  var middleLon = (verts[0][1] + verts[1][1]) / 2;

  // Latitude: just split in half.
  var middleLat = (verts[0][0] + verts[2][0]) / 2;

  result.center = [ middleLat, middleLon ];
  result.top = [ verts[0][0], middleLon ];
  result.bottom = [ verts[2][0], middleLon ];
  result.left = [ middleLat, verts[0][1] ];
  result.right = [ middleLat, verts[1][1] ];

  return result;
};

// Mercator
//
// Conformal, but can't quite reach the poles.

function MercatorProjection() {
}
MercatorProjection.prototype = new Projection();

// (thank you Wikipedia!)
function mercatorLatitudeToY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
}
function mercatorYToLatitude(y) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
}

MercatorProjection.prototype.subdivide = function(verts, level) {
  var result = {};

  // Longitude: just split in half.
  var middleLon = (verts[0][1] + verts[1][1]) / 2;

  // Latitude --> split the y projection in half.
  var y0 = mercatorLatitudeToY(verts[0][0]);
  var y1 = mercatorLatitudeToY(verts[2][0]);
  var middleY = (y0 + y1) / 2;
  var middleLat = mercatorYToLatitude(middleY);

  result.center = [ middleLat, middleLon ];
  result.top = [ verts[0][0], middleLon ];
  result.bottom = [ verts[2][0], middleLon ];
  result.left = [ middleLat, verts[0][1] ];
  result.right = [ middleLat, verts[1][1] ];

  return result;
};

//
// Bent Mercator
//
// Linearly map 0-90 degrees latitude onto 0-maxlat, and otherwise
// behave like Mercator.
//
// Works well and covers the whole sphere, but eventually gets very
// anisotropic near the poles.  Somewhere between Plate-Carree and
// regular Mercator.

function BentMercatorProjection(maxLat) {
  var me = this;
  me.maxLat = maxLat;
}
BentMercatorProjection.prototype = new MercatorProjection();

// Map 0-90 onto 0-maxLat
BentMercatorProjection.prototype.mapLat = function(lat) {
  var me = this;
  return (lat / 90) * me.maxLat;
};

// Map 0-maxLat onto 0-90
BentMercatorProjection.prototype.invMapLat = function(lat) {
  var me = this;
  return Math.max(-90, Math.min((lat / me.maxLat) * 90, 90));
};

BentMercatorProjection.prototype.splitLat = function(lat0, lat1) {
  var me = this;
  var y0 = mercatorLatitudeToY(me.mapLat(lat0));
  var y1 = mercatorLatitudeToY(me.mapLat(lat1));
  var middleY = (y0 + y1) / 2;
  var newLat = me.invMapLat(mercatorYToLatitude(middleY));
  return newLat;
};

BentMercatorProjection.prototype.subdivide = function(verts, level) {
  var me = this;
  var result = {};

  // Longitude: just split in half.
  var middleLon = (verts[0][1] + verts[1][1]) / 2;

  // Latitude --> split the y projection in half.
  var middleLat = me.splitLat(verts[0][0], verts[2][0]);

  result.center = [ middleLat, middleLon ];
  result.top = [ verts[0][0], middleLon ];
  result.bottom = [ verts[2][0], middleLon ];
  result.left = [ middleLat, verts[0][1] ];
  result.right = [ middleLat, verts[1][1] ];

  return result;
};

// CubeCell
//
// This is a cube-map projection.

function CubeCellProjection() {
  var me = this;
}
CubeCellProjection.prototype = new Projection();
CubeCellProjection.prototype.minLevel = 0;
// since we use a Cubemap, we have 8 roots instead of one, so we
// recurse one fewer level to do a comparable subdivision.
CubeCellProjection.prototype.maxLevel -= 1;

CubeCellProjection.prototype.getViewDistance = function(verts, level, camLoc) {
  // Cheesy circular approximation.
  // TODO: fix
  var a = latLonTo3d(verts[0]);
  var b = latLonTo3d(verts[1]);
  var c = latLonTo3d(verts[2]);
  var d = latLonTo3d(verts[3]);
  var center = scale3d(add3d(add3d(a, b), add3d(c, d)), 1/4);
  var radius = earthDistance3d(center, a);

  var cam3d = latLonTo3d(camLoc);
  var dist = earthDistance3d(cam3d, center);
  if (dist < radius) {
    return 0;
  } else {
    return dist - radius;
  }
};

CubeCellProjection.prototype.getFeatureSize = function(verts, level) {
  var a = latLonTo3d(verts[0]);
  var b = latLonTo3d(verts[1]);
  var boundarySize = earthDistance3d(a, b);
  return boundarySize / TILE_RESOLUTION;
};

CubeCellProjection.prototype.drawDivisions = function(subdivision) {
  drawGeodesic(subdivision.top, subdivision.center);
  drawGeodesic(subdivision.center, subdivision.bottom);
  drawGeodesic(subdivision.left, subdivision.center);
  drawGeodesic(subdivision.center, subdivision.right);
};

CubeCellProjection.prototype.subdivide = function(verts, level) {
  var result = {};

  var v0 = latLonTo3d(verts[0]);
  var v1 = latLonTo3d(verts[1]);
  var v2 = latLonTo3d(verts[2]);
  var v3 = latLonTo3d(verts[3]);
  
  result.center = latLonFrom3d(
      scale3d(add3d(add3d(v0, v3), add3d(v1, v2)), 1/4));
  result.top = latLonFrom3d(bisect3d(v0, v1));
  result.bottom = latLonFrom3d(bisect3d(v2, v3));
  result.left = latLonFrom3d(bisect3d(v0, v2));
  result.right = latLonFrom3d(bisect3d(v1, v3));

  return result;
};

// Application code

// Returns camLocation as a [lat,lon,alt] triple.
function getCameraLocation() {
  var la = ge.getView().copyAsLookAt(ge.ALTITUDE_RELATIVE_TO_GROUND);
  var camLoc = [ la.getLatitude(), la.getLongitude(), la.getAltitude() ];
  return camLoc;
}

// Draw a line between the two given points, that would be straight in
// a lat/lon projection.
function drawLatLonLine(vertStart, vertEnd) {
  // Normally a linestring wants to make a geodesic, so we subdivide
  // so the segments are relatively short, to make the distortion
  // small.

  var linestring = ge.createLineString("");
  var placemark = ge.createPlacemark("");
  placemark.setGeometry(linestring);
  linestring.setTessellate(true);

  var deltaLon = vertEnd[1] - vertStart[1];
  var worstLat = Math.max(Math.abs(vertStart[0]), Math.abs(vertEnd[0]));
  var stepSize = 10 * Math.cos(worstLat * Math.PI / 180) + 0.01;
  var steps = Math.floor(Math.abs(deltaLon) / stepSize);
  var stepLat = (vertEnd[0] - vertStart[0]) / (steps + 1);
  var stepLon = deltaLon / (steps + 1);
  var lat = vertStart[0];
  var lon = vertStart[1];
  linestring.getCoordinates().pushLatLngAlt(lat, lon, LINE_ALT);
  for (var i = 0; i < steps; i++) {
    lat += stepLat;
    lon += stepLon;
    linestring.getCoordinates().pushLatLngAlt(lat, lon, LINE_ALT);
  }
  linestring.getCoordinates().pushLatLngAlt(vertEnd[0], vertEnd[1], LINE_ALT);

  currentProjectionFolder.getFeatures().appendChild(placemark);
}

// Draw a line between the two given points, on the geodesic.
function drawGeodesic(vertStart, vertEnd) {
  var linestring = ge.createLineString("");
  var placemark = ge.createPlacemark("");
  placemark.setGeometry(linestring);
  linestring.setTessellate(true);
  linestring.getCoordinates().pushLatLngAlt(
                  vertStart[0], vertStart[1], LINE_ALT);
  linestring.getCoordinates().pushLatLngAlt(
                  vertEnd[0], vertEnd[1], LINE_ALT);
  currentProjectionFolder.getFeatures().appendChild(placemark);
}

// Clear existing rendered lines.
function clearProjection() {
  if (currentProjectionFolder) {
    currentProjectionFolder.setVisibility(false);
    ge.getFeatures().removeChild(currentProjectionFolder);
  }
  currentProjectionFolder = ge.createFolder("");
  currentProjectionFolder.setName("Plate-Carree");
  ge.getFeatures().appendChild(currentProjectionFolder);

  nodeCount = 0;
}

function updateNodeCount() {
  document.getElementById("node_ct").innerHTML = nodeCount;
}

function drawPlateCarree() {
  clearProjection();
  var cam = getCameraLocation();
  var proj = new PlateCarreeProjection();

  // Cover the earth with two quads, one over the western hemisphere
  // and one over the eastern hemisphere.
  drawLatLonLine([90, -180], [0, -180]);
  drawLatLonLine([0, -180], [-90, -180]);
  drawLatLonLine([90, 0], [0, 0]);
  drawLatLonLine([0, 0], [-90, 0]);
  proj.displayNode([ [90, -180], [90, 0], [-90, -180], [-90, 0] ],
                   0, cam);
  proj.displayNode([ [90, 0], [90, 180], [-90, 0], [-90, 180] ],
                   0, cam);
  updateNodeCount();
}

function drawMercator() {
  clearProjection();
  var cam = getCameraLocation();
  var proj = new MercatorProjection();
  
  // One big quad
  var MAX_LAT = 85;
  drawLatLonLine([90, -180], [0, -180]);
  drawLatLonLine([0, -180], [-90, -180]);
  proj.displayNode([[MAX_LAT,-180], [MAX_LAT,180],
                    [-MAX_LAT,-180], [-MAX_LAT,180]],
                   0, cam);
  updateNodeCount();
}

function drawBentMercator() {
  clearProjection();
  var cam = getCameraLocation();
  var MAX_MAPPED_LAT = 85;
  var proj = new BentMercatorProjection(MAX_MAPPED_LAT);
  
  // One big quad
  var MAX_LAT = 90;
  drawLatLonLine([90, -180], [0, -180]);
  drawLatLonLine([0, -180], [-90, -180]);
  proj.displayNode([[MAX_LAT,-180], [MAX_LAT,180],
                    [-MAX_LAT,-180], [-MAX_LAT,180]],
                   0, cam);
  updateNodeCount();
}

function drawCubeCell() {
  clearProjection();
  var cam = getCameraLocation();
  var proj = new CubeCellProjection();
  
  // Cube map.
  var v0 = latLonFrom3d([ 1, -1,  1]);
  var v1 = latLonFrom3d([ 1,  1,  1]);
  var v2 = latLonFrom3d([ 1, -1, -1]);
  var v3 = latLonFrom3d([ 1,  1, -1]);
  var v4 = latLonFrom3d([-1,  1,  1]);
  var v5 = latLonFrom3d([-1, -1,  1]);
  var v6 = latLonFrom3d([-1,  1, -1]);
  var v7 = latLonFrom3d([-1, -1, -1]);
  drawGeodesic(v0, v1);
  drawGeodesic(v1, v3);
  drawGeodesic(v3, v2);
  drawGeodesic(v2, v0);
  drawGeodesic(v4, v5);
  drawGeodesic(v5, v7);
  drawGeodesic(v7, v6);
  drawGeodesic(v6, v4);
  drawGeodesic(v0, v5);
  drawGeodesic(v1, v4);
  drawGeodesic(v2, v7);
  drawGeodesic(v3, v6);
  proj.displayNode([v0, v1, v2, v3], 0, cam);
  proj.displayNode([v1, v3, v4, v6], 0, cam);
  proj.displayNode([v4, v5, v6, v7], 0, cam);
  proj.displayNode([v5, v7, v0, v2], 0, cam);
  proj.displayNode([v5, v4, v0, v1], 0, cam);  // north cap
  proj.displayNode([v2, v3, v7, v6], 0, cam);  // south cap
  updateNodeCount();
}
