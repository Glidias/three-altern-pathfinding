import { BinaryHeap } from './BinaryHeap';
import { Utils } from './Utils.js';

class AStar {
  static init (graph) {
    for (let x = 0; x < graph.length; x++) {
      //for(var x in graph) {
      const node = graph[x];
      node.f = 0;
      node.g = 0;
      node.h = 0;
      node.cost = 1.0;
      node.visited = false;
      node.closed = false;
      node.parent = null;
      node.restrict = null;
      if (node.subMesh) {
         for (let y = 0; y < node.subMesh.polygons.length; y++) {
            const n = node.subMesh.polygons[y];
            n.f = 0;
            n.g = 0;
            n.h = 0;
            n.cost = 1.0;
            n.visited = false;
            n.closed = false;
            n.parent = null;
            n.restrict = null;
         }
      }
    }
  }

  static cleanUp (graph) {
    for (let x = 0; x < graph.length; x++) {
      const node = graph[x];
      delete node.f;
      delete node.g;
      delete node.h;
      delete node.cost;
      delete node.visited;
      delete node.closed;
      delete node.parent;
    }
  }

  static heap () {
    return new BinaryHeap(function (node) {
      return node.f;
    });
  }

  // Restriction hack methods when A-star searching through degenerate (dummy zero-area) nodes

  static isRestricted (portal, res) {
    var dp1 = res.x * portal[0].x + res.z * portal[0].z;
    var dp2 = res.x * portal[1].x + res.z * portal[1].z;
    return (dp1 < res.a && dp2 < res.a) || (dp1 > res.b && dp2 > res.b); 
    // result =
    // console.log(result + ": :"+dp1 + ", "+dp2 + "vs:" + res.a + ", "+res.b);
    // return result;
  }

  static setRestricted (fromNode, target, vertices) {
    var portal = fromNode.parent ? fromNode.parent.portals[fromNode.parent.neighbours.indexOf(fromNode)] : this.findAnyOtherPortalBesides(fromNode, target);
    if (!portal) {
      console.log("Failed to find restrict portal");
      return;
    }
    if (typeof(portal[0]) === "number") {
      portal = [
       vertices[portal[0]], vertices[portal[1]]
      ];
    }
    var dx = portal[1].x - portal[0].x;
    var dy = portal[1].z - portal[0].z;
    target.restrict = target.restrict ? target.restrict : new Utils.Vec3Constructor();
    target.restrict.x = dx;
    target.restrict.z = dy;
    target.restrict.a = dx*portal[0].x + dy*portal[0].z;
    target.restrict.b = dx*portal[1].x + dy*portal[1].z;
  }

  static findAnyOtherPortalBesides (fromNode, target) {
    console.log("Makeshift portal select");
    var i = fromNode.neighbours.length;
    while(--i > -1) {
      if (fromNode.neighbours[i] !== target) {
        const arr = fromNode.portals[i].concat();
        arr.reverse();
        return arr;
      }
    }
  }

  // The main A-star search function

  static search (graph, start, end, vertices) {
    this.init(graph);
    //heuristic = heuristic || astar.manhattan;


    const openHeap = this.heap();

    openHeap.push(start);

    while (openHeap.size() > 0) {

      // Grab the lowest f(x) to process next.  Heap keeps this sorted for us.
      const currentNode = openHeap.pop();

      // End case -- result has been found, return the traced path.
      if (currentNode === end) {
        let curr = currentNode;
        const ret = [];
        while (curr.parent) {
          ret.push(curr);
          curr = curr.parent;
        }
        this.cleanUp(ret);
        return ret.reverse();
      }

      // Normal case -- move currentNode from open to closed, process each of its neighbours.
      currentNode.closed = true;

      // Find all neighbours for the current node. Optionally find diagonal neighbours as well (false by default).
      const neighbours = currentNode.neighbours;

      for (let i = 0, il = neighbours.length; i < il; i++) {
        const neighbour = neighbours[i];

       
        if ( neighbour.closed || (currentNode.restrict && this.isRestricted(currentNode.portals[i], currentNode.restrict)) ) {
          // Not a valid node to process, skip to next neighbour.
          continue;
        }

        // The g score is the shortest distance from start to current node.
        // We need to check if the path we have arrived at this neighbour is the shortest one we have seen yet.
        const gScore = currentNode.g + (currentNode.neighbourCosts ? currentNode.neighbourCosts[i] : neighbour.cost);  // currentNode.neighbourCosts ? currentNode.neighbourCosts[i] :
        const beenVisited = neighbour.visited;

        if (!beenVisited || gScore < neighbour.g) {

          // Found an optimal (so far) path to this node.  Take score for node to see how good it is.
          neighbour.visited = true;
          if (currentNode.restrict && neighbour.degenerate) {
            neighbour.restrict = currentNode.restrict;
          }
          else if (neighbour.degenerate && !currentNode.degenerate) {
            this.setRestricted(currentNode, neighbour, vertices);
          }
         
          neighbour.parent = currentNode;
          if (!neighbour.centroid || !end.centroid) throw new Error('Unexpected state');
          neighbour.h = neighbour.h || this.heuristic(neighbour.centroid, end.centroid);
          neighbour.g = gScore;
          neighbour.f = neighbour.g + neighbour.h;

          if (!beenVisited) {
            // Pushing to heap will put it in proper place based on the 'f' value.
            openHeap.push(neighbour);
          } else {
            // Already seen the node, but since it has been rescored we need to reorder it in the heap
            openHeap.rescoreElement(neighbour);
          }
        }
      }
    }

    // No result was found - empty array signifies failure to find path.
    return [];
  }

  static heuristic (pos1, pos2) {
    var deltaX = pos2.x - pos1.x;
    var deltaY = pos2.y - pos1.y;
    var deltaZ = pos2.z - pos1.z;
    // this one is overestimated.. //Utils.distanceToSquared(pos1, pos2);
    return 2.5 * Math.sqrt(deltaX*deltaX + deltaY*deltaY +deltaZ*deltaZ);  //
  }
}

export { AStar };
