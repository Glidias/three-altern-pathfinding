import { Utils } from './Utils';

class Channel {
  constructor () {
    this.portals = [];
  }

  push (p1, p2) {
    if (p2 === undefined) p2 = p1;
    this.portals.push({
      left: p1,
      right: p2
    });
  }

  pushDegenerate (p1, p2) {
    var dx = p2.x - p1.x;
    var dz = p2.z - p1.z;
    var dist = dx*dx + dz*dz;
    this.portals.push({
      left: p1,
      right: p2
    });
    return dist;
  }

  pushDegenerate2 (p1, p2, dist) {
    var dx = p2.x - p1.x;
    var dz = p2.z - p1.z;
    var tryDist = dx*dx + dz*dz;
    if (tryDist < dist) {
      dist = tryDist;
      this.portals[this.portals.length - 1].left = p1;
      this.portals[this.portals.length - 1].right = p2;
    }
    return dist;
  }

  stringPull () {
    const portals = this.portals;
    const pts = [];
    // Init scan state
    let portalApex, portalLeft, portalRight;
    let apexIndex = 0,
      leftIndex = 0,
      rightIndex = 0;

    portalApex = portals[0].left;
    portalLeft = portals[0].left;
    portalRight = portals[0].right;

    // Add start point.
    pts.push(portalApex);

    for (let i = 1; i < portals.length; i++) {
      const left = portals[i].left;
      const right = portals[i].right;

      // Update right vertex.
      if (Utils.triarea2(portalApex, portalRight, right) <= 0.0) {
        if (Utils.vequal(portalApex, portalRight) || Utils.triarea2(portalApex, portalLeft, right) > 0.0) {
          // Tighten the funnel.
          portalRight = right;
          rightIndex = i;
        } else {
          // Right over left, insert left to path and restart scan from portal left point.
          pts.push(portalLeft);
          // Make current left the new apex.
          portalApex = portalLeft;
          apexIndex = leftIndex;
          // Reset portal
          portalLeft = portalApex;
          portalRight = portalApex;
          leftIndex = apexIndex;
          rightIndex = apexIndex;
          // Restart scan
          i = apexIndex;
          continue;
        }
      }

      // Update left vertex.
      if (Utils.triarea2(portalApex, portalLeft, left) >= 0.0) {
        if (Utils.vequal(portalApex, portalLeft) || Utils.triarea2(portalApex, portalRight, left) < 0.0) {
          // Tighten the funnel.
          portalLeft = left;
          leftIndex = i;
        } else {
          // Left over right, insert right to path and restart scan from portal right point.
          pts.push(portalRight);
          // Make current right the new apex.
          portalApex = portalRight;
          apexIndex = rightIndex;
          // Reset portal
          portalLeft = portalApex;
          portalRight = portalApex;
          leftIndex = apexIndex;
          rightIndex = apexIndex;
          // Restart scan
          i = apexIndex;
          continue;
        }
      }
    }

    if ((pts.length === 0) || (!Utils.vequal(pts[pts.length - 1], portals[portals.length - 1].left))) {
      // Append last point to path.
      pts.push(portals[portals.length - 1].left);
    }

    this.path = pts;
    return pts;
  }
}

export { Channel };
