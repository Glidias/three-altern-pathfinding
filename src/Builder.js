import { Utils } from './Utils';

let polygonId = 1;

class Builder {
  /**
   * Constructs groups from the given navigation mesh.
   * @param  {THREE.Geometry} geometry
   * @return {Zone}
   */
  static buildZone (geometry) {

    const navMesh = this._buildNavigationMesh(geometry);

    const zone = {};

    navMesh.vertices.forEach((v) => {
      v.x = Utils.roundNumber(v.x, 2);
      v.y = Utils.roundNumber(v.y, 2);
      v.z = Utils.roundNumber(v.z, 2);
    });

    zone.vertices = navMesh.vertices;

    const groups = this._buildPolygonGroups(navMesh);

    zone.groups = [];

    /*  // Not needed anymore
    const findPolygonIndex = function (group, p) {
      for (let i = 0; i < group.length; i++) {
        if (p === group[i]) return i;
      }
    };
    */

    // TODO: This block represents 50-60% of navigation mesh construction time,
    // and could probably be optimized. For example, construct portals while
    // determining the neighbor graph.
    groups.forEach((group) => {

      const newGroup = [];
      group.forEach((p) => {

        // Not needed anymore, use direct neighbour reference

        // Build a portal list to each neighbour
        const portals = p.neighbours.map((n) => this._getSharedVerticesInOrder(p, n));

        p.centroid.x = Utils.roundNumber(p.centroid.x, 2);
        p.centroid.y = Utils.roundNumber(p.centroid.y, 2);
        p.centroid.z = Utils.roundNumber(p.centroid.z, 2);
   
        p.portals = portals;
        newGroup.push(p);
      });

      zone.groups.push(newGroup);
    });

    return zone;
  }

  /**
   * Constructs a navigation mesh from the given geometry.
   * @param {THREE.Geometry} geometry
   * @return {Object}
   */
  static _buildNavigationMesh (geometry) {
    if (geometry.faces) Utils.computeCentroids(geometry);
    if (geometry.mergeVertices) geometry.mergeVertices();
    return this._buildPolygonsFromGeometry(geometry);
  }

  static _buildPolygonGroups (navigationMesh) {

    const polygons = navigationMesh.polygons;

    const polygonGroups = [];
    let groupCount = 0;

    const spreadGroupId = function (polygon) {
      polygon.neighbours.forEach((neighbour) => {
        if (neighbour.group === undefined) {
          neighbour.group = polygon.group;
          spreadGroupId(neighbour);
        }
      });
    };

    polygons.forEach((polygon) => {

      if (polygon.group === undefined) {
        polygon.group = groupCount++;
        // Spread it
        spreadGroupId(polygon);
      }

      if (!polygonGroups[polygon.group]) polygonGroups[polygon.group] = [];

      polygonGroups[polygon.group].push(polygon);
    });

    return polygonGroups;
  }

  static _buildPolygonNeighbours (polygon, navigationMesh, vertexPolygonMap) {
    const neighbors = new Set();

    const groupA = vertexPolygonMap.get(polygon.vertexIds[0]);
    const groupB = vertexPolygonMap.get(polygon.vertexIds[1]);
    const groupC = vertexPolygonMap.get(polygon.vertexIds[2]);

    // It's only necessary to iterate groups A and B. Polygons contained only
    // in group C cannot share a >1 vertex with this polygon.
    // IMPORTANT: Bublé cannot compile for-of loops.
    groupA.forEach((candidate) => {
      if (navigationMesh.polygons[candidate] === polygon) return;
      if (groupB.has(candidate) || groupC.has(candidate)) {
        neighbors.add(navigationMesh.polygons[candidate]);
      }
    });
    groupB.forEach((candidate) => {
      if (navigationMesh.polygons[candidate] === polygon) return;
      if (groupC.has(candidate)) {
        neighbors.add(navigationMesh.polygons[candidate]);
      }
    });

    polygon.neighbours = Array.from(neighbors);
    polygon.neighbourCosts = this._getCostsOfNeighboursFromCentroid(polygon.neighbours, polygon.centroid);
  }

  static _getCostsOfNeighboursFromCentroid (neighbors, centroid) {
    return neighbors.map((n) => {
      var dx = n.centroid.x - centroid.x;
      var dy = n.centroid.y - centroid.y;
      var dz = n.centroid.z - centroid.z;
      return Math.sqrt(dx*dx + dy*dy + dz*dz);
    });
  }

  static _alternCentroidFromVerticesIndices(vertices, a, b, c) {
    a *=3;
    b *=3;
    c *=3;
    var ax = vertices[a]; var ay = vertices[a+1]; var az = vertices[a+2];
    var bx = vertices[b]; var by = vertices[b+1]; var bz = vertices[b+2];
    var cx = vertices[c]; var cy = vertices[c+1]; var cz = vertices[c+2];
    a = ax + bx + cx;
    b = ay + by + cy;
    c = az + bz + cz;
    return new Utils.Vec3Constructor(a/3,b/3,c/3);
  }

  /*
  static _alternNormalFromVerticesIndices(vertices, a, b, c) {
    a *=3;
    b *=3;
    c *=3;
    var ax = vertices[a]; var ay = vertices[a+1]; var az = vertices[a+2];
    var bx = vertices[b]; var by = vertices[b+1]; var bz = vertices[b+2];
    var cx = vertices[c]; var cy = vertices[c+1]; var cz = vertices[c+2];
    var abx = bx - ax;
    var aby = by - ay;
    var abz = bz - az;
    var acx = cx - ax;
    var acy = cy - ay;
    var acz = cz - az;
    var normalX = acz*aby - acy*abz;
    var normalY = acx*abz - acz*abx;
    var normalZ = acy*abx - acx*aby;
    var len = normalX*normalX + normalY*normalY + normalZ*normalZ;
    if (len == 0) {
      console.warn('_alternNormalFromVerticesIndices:: Zero length normal detected!'+ [normalX, normalY, normalZ]);
      normalX = 0;
      normalY = 1;
      normalZ = 0;
      len = 1;
    }
    len = 1/Math.sqrt(len);
    normalX *= len;
    normalY *= len;
    normalZ *= len;
    var offset = ax*normalX + ay*normalY + az*normalZ;
    var v = new Utils.Vec3Constructor(normalX, normalY, normalZ);
    v.w = offset;
    return v;
  }
  */

  static _buildPolygonsFromGeometry (geometry) {

    const polygons = [];
    var vertices = geometry.vertices;
    const numVertices = geometry.indices ? geometry.vertices.length / 3 : vertices.length;   // Assumed Altern Geometry if got indices
    //const faceVertexUvs = geometry.faceVertexUvs;

    // Constructing the neighbor graph brute force is O(n²). To avoid that,
    // create a map from vertices to the polygons that contain them, and use it
    // while connecting polygons. This reduces complexity to O(n*m), where 'm'
    // is related to connectivity of the mesh.
    const vertexPolygonMap = new Map(); // Map<vertexID, Set<polygonIndex>>
    for (let i = 0; i < numVertices; i++) {
      vertexPolygonMap.set(i, new Set());
    }

  // Convert the faces into a custom format that supports more than 3 vertices (but it really uses more than that? Seems like all trimeshes are used only)

  if (geometry.indices) {  // Assumed Altern Geometry
      for (i=0; i< geometry.indices.length; i+=3) {
        polygons.push({
        id: polygonId++,
        index: polygons.length,
        vertexIds: [geometry.indices[i], geometry.indices[i+1], geometry.indices[i+2]],
        centroid: this._alternCentroidFromVerticesIndices(geometry.vertices, geometry.indices[i], geometry.indices[i+1], geometry.indices[i+2]),
        //normal: this._alternNormalFromVerticesIndices(geometry.vertices,geometry.indices[i], geometry.indices[i+1], geometry.indices[i+2]),  // appears to be unneeded
        neighbours: [],
        transformId: 0
      });
      vertexPolygonMap.get(geometry.indices[i]).add(polygons.length - 1);
      vertexPolygonMap.get(geometry.indices[i+1]).add(polygons.length - 1);
      vertexPolygonMap.get(geometry.indices[i+2]).add(polygons.length - 1);
    }

    var alternVertsConv = [];
    for (i=0; i< geometry.vertices.length; i+=3) {
      alternVertsConv.push( new Utils.Vec3Constructor(geometry.vertices[i], geometry.vertices[i+1], geometry.vertices[i+2]));
    }
    vertices = alternVertsConv;
  }
  else {  // Assumed THREEJS Geometry
    geometry.faces.forEach((face) => {
      polygons.push({
        id: polygonId++,
        vertexIds: [face.a, face.b, face.c],
        centroid: face.centroid,
        //normal: face.normal,
        neighbours: []
      });
      vertexPolygonMap.get(face.a).add(polygons.length - 1);
      vertexPolygonMap.get(face.b).add(polygons.length - 1);
      vertexPolygonMap.get(face.c).add(polygons.length - 1);
    });
  }
    const navigationMesh = {
      polygons: polygons,
      vertices: vertices,
     // faceVertexUvs: faceVertexUvs
    };

    // Build a list of adjacent polygons
    polygons.forEach((polygon) => {
      this._buildPolygonNeighbours(polygon, navigationMesh, vertexPolygonMap);
    });

    return navigationMesh;
  }

  static _getSharedVerticesInOrder (a, b) {

    const aList = a.vertexIds;
    const bList = b.vertexIds;

    const sharedVertices = new Set();

    aList.forEach((vId) => {
      if (bList.includes(vId)) {
        sharedVertices.add(vId);
      }
    });

    if (sharedVertices.size < 2) return [];

    if (sharedVertices.has(aList[0]) && sharedVertices.has(aList[aList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      aList.push(aList.shift());
    }

    if (sharedVertices.has(bList[0]) && sharedVertices.has(bList[bList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      bList.push(bList.shift());
    }

    // Again!
    const sharedVerticesOrdered = [];

    aList.forEach((vId) => {
      if (bList.includes(vId)) {
        sharedVerticesOrdered.push(vId);
      }
    });

    return sharedVerticesOrdered;
  }
}

export { Builder };
