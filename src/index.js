/* global THREE */

import { Utils } from './Utils';
import { AStar } from './AStar';
import { Builder } from './Builder';
import { Channel } from './Channel';

/**
 * Defines an instance of the pathfinding module, with one or more zones.
 */
class Pathfinding {
	constructor () {
		this.zones = {};
		this.delPolygonId = 0;
	}

	static setVec3Constructor(cs) {
		Utils.Vec3Constructor= cs;
	}

	static setBuilderPrecision(v) {
		Builder.PRECISION = v;
	}

	/**
	 * (Static) Builds a zone/node set from navigation mesh geometry.
	 * @param  {THREE.BufferGeometry} geometry
	 * @return {Zone}
	 */
	static createZone (geometry) {
		if ( geometry.isGeometry ) {
			// Haven't actually implemented support for BufferGeometry yet, but Geometry is somewhat
			// not-recommended these days, so go ahead and start warning.
			console.warn('[three-pathfinding]: Use THREE.BufferGeometry, not THREE.Geometry, to create zone.');
		} else {
			geometry = geometry.indices ? geometry : new THREE.Geometry().fromBufferGeometry(geometry);
		}

		return Builder.buildZone(geometry);
	}

	/**
	 * Sets data for the given zone.
	 * @param {string} zoneID
	 * @param {Zone} zone
	 */
	setZoneData (zoneID, zone) {
		this.zones[zoneID] = zone;
	}

	/**
	 * Returns closest node group ID for given position.
	 * @param  {string} zoneID
	 * @param  {THREE.Vector3} position
	 * @return {number}
	 */
	getGroup (zoneID, position) {
		if (!this.zones[zoneID]) return null;

		let closestNodeGroup = null;
		let distance = Math.pow(50, 2);

		this.zones[zoneID].groups.forEach((group, index) => {
			group.forEach((node) => {
				const measuredDistance = Utils.distanceToSquared(node.centroid, position);
				if (measuredDistance < distance) {
					closestNodeGroup = index;
					distance = measuredDistance;
				}
			});
		});

		return closestNodeGroup;
	}

	/**
	 * Returns a random node within a given range of a given position.
	 * @param  {string} zoneID
	 * @param  {number} groupID
	 * @param  {THREE.Vector3} nearPosition
	 * @param  {number} nearRange
	 * @return {Node}
	 */
	getRandomNode (zoneID, groupID, nearPosition, nearRange) {

		if (!this.zones[zoneID]) return new Utils.Vec3Constructor();

		nearPosition = nearPosition || null;
		nearRange = nearRange || 0;

		const candidates = [];
		const polygons = this.zones[zoneID].groups[groupID];

		polygons.forEach((p) => {
			if (nearPosition && nearRange) {
				if (Utils.distanceToSquared(nearPosition, p.centroid) < nearRange * nearRange) {
					candidates.push(p.centroid);
				}
			} else {
				candidates.push(p.centroid);
			}
		});

		return Utils.sample(candidates) || new Utils.Vec3Constructor();
	}

	/**
	 * Returns the closest node to the target position.
	 * @param  {THREE.Vector3} position
	 * @param  {string}  zoneID
	 * @param  {number}  groupID
	 * @param  {boolean} checkPolygon
	 * @return {Node}
	 */
	getClosestNode (position, zoneID, groupID, checkPolygon = false) {
		const nodes = this.zones[zoneID].groups[groupID];
		const vertices = this.zones[zoneID].vertices;
		let closestNode = null;
		let closestDistance = Infinity;

		nodes.forEach((node) => {
			const distance = Utils.distanceToSquared(node.centroid, position);
			if (distance < closestDistance
					&& (!checkPolygon || Utils.isVectorInPolygon(position, node, vertices))) {
				closestNode = node;
				closestDistance = distance;
			}
		});

		return closestNode;
	}

	/**
	 * Returns a path between given start and end points. If a complete path
	 * cannot be found, will return the nearest endpoint available.
	 *
	 * @param  {THREE.Vector3} startPosition Start position.
	 * @param  {THREE.Vector3} targetPosition Destination.
	 * @param  {string} zoneID ID of current zone.
	 * @param  {number} groupID Current group ID.
	 * @param  {Node} closestNode Manually supply startPosition node
	 * @param  {Node} farthestNode Manually supply targetPosition node
	 * @return {Array<THREE.Vector3>} Array of points defining the path.
	 */
	findPath (startPosition, targetPosition, zoneID, groupID, closestNode, farthestNode) {
		const nodes = this.zones[zoneID].groups[groupID];
		const vertices = this.zones[zoneID].vertices;

		closestNode = closestNode ? closestNode : this.getClosestNode(startPosition, zoneID, groupID);
		farthestNode = farthestNode ? farthestNode : this.getClosestNode(targetPosition, zoneID, groupID, true);

		// If we can't find any node, just go straight to the target
		if (!closestNode || !farthestNode) {
			return null;
		}

		const paths = AStar.search(nodes, closestNode, farthestNode);

		const getPortalFromTo = function (a, b) {
			for (var i = 0; i < a.neighbours.length; i++) {
				if (a.neighbours[i] === b) {
					return a.portals[i];
				}
			}
		};

		if (paths.length === 0) return paths;

		// We have the corridor, now pull the rope.
		const channel = new Channel();
		channel.push(startPosition);
		var dist;
		for (let i = 0; i < paths.length; i++) {
			const polygon = paths[i];
			const nextPolygon = paths[i + 1];

			if (nextPolygon) {
				const portals = getPortalFromTo(polygon, nextPolygon);
				const numType = typeof portals[0] === 'number';
				const a = numType ? vertices[portals[0]] : portals[0];
				const b = numType ? vertices[portals[1]] : portals[1];
				
				if (!polygon.degenerate && !nextPolygon.degenerate) {
					channel.push(a, b);
				}
				else {
					if (!polygon.degenerate && nextPolygon.degenerate) { // new degenerate 
						dist = channel.pushDegenerate(a, b);
					}
					else {	// resume degenerate
						dist = channel.pushDegenerate2(a, b, dist);
					}
					
				}
			}
		}
		channel.push(targetPosition);
		channel.stringPull();

		// Return the path, omitting first position (which is already known).
		const path = channel.path.map((c) => new Utils.Vec3Constructor(c.x, c.y, c.z));
		path.shift();
		this.lastChannel  = channel;
		return path;
	}
}

/**
 * Clamps a step along the navmesh, given start and desired endpoint. May be
 * used to constrain first-person / WASD controls.
 *
 * @param  {THREE.Vector3} start
 * @param  {THREE.Vector3} end Desired endpoint.
 * @param  {Node} node
 * @param  {string} zoneID
 * @param  {number} groupID
 * @param  {THREE.Vector3} endTarget Updated endpoint.
 * @return {Node} Updated node.
 */
/*
Pathfinding.prototype.clampStep = (function () {
	if (!window.THREE) {

		alert('clampStep not supported without THREEJS');
		return;
	}
	const point = new THREE.Vector3();
	const plane = new THREE.Plane();
	const triangle = new THREE.Triangle();

	let closestNode;
	let closestPoint = new THREE.Vector3();
	let closestDistance;

	return function (start, end, node, zoneID, groupID, endTarget) {
		const vertices = this.zones[zoneID].vertices;
		const nodes = this.zones[zoneID].groups[groupID];

		const nodeQueue = [node];
		const nodeDepth = {};
		nodeDepth[node.id] = 0;

		closestNode = undefined;
		closestPoint.set(0, 0, 0);
		closestDistance = Infinity;

		// Project the step along the current node.
		plane.setFromCoplanarPoints(
			vertices[node.vertexIds[0]],
			vertices[node.vertexIds[1]],
			vertices[node.vertexIds[2]]
		);
		plane.projectPoint(end, point);
		end.copy(point);

		for (let currentNode = nodeQueue.pop(); currentNode; currentNode = nodeQueue.pop()) {

			triangle.set(
				vertices[currentNode.vertexIds[0]],
				vertices[currentNode.vertexIds[1]],
				vertices[currentNode.vertexIds[2]]
			);

			triangle.closestPointToPoint(end, point);

			if (point.distanceToSquared(end) < closestDistance) {
				closestNode = currentNode;
				closestPoint.copy(point);
				closestDistance = point.distanceToSquared(end);
			}

			const depth = nodeDepth[currentNode];
			if (depth > 2) continue;

			for (let i = 0; i < currentNode.neighbours.length; i++) {
				const neighbour = currentNode.neighbours[i];
				if (neighbour.id in nodeDepth) continue;

				nodeQueue.push(neighbour);
				nodeDepth[neighbour.id] = depth + 1;
			}
		}

		endTarget.copy(closestPoint);
		return closestNode;
	};
}());
*/

/**
 * Defines a zone of interconnected groups on a navigation mesh.
 *
 * @type {Object}
 * @property {Array<Group>} groups
 * @property {Array<THREE.Vector3} vertices
 */
const Zone = {}; // jshint ignore:line

/**
 * Defines a group within a navigation mesh.
 *
 * @type {Object}
 */
const Group = {}; // jshint ignore:line

/**
 * Defines a node (or polygon) within a group.
 *
 * @type {Object}
 * @property {number} id
 * @property {Array<number>} neighbours IDs of neighboring nodes.
 * @property {Array<number} vertexIds
 * @property {THREE.Vector3} centroid
 * @property {Array<Array<number>>} portals Array of portals, each defined by two vertex IDs.
 * @property {boolean} closed
 * @property {number} cost
 */
const Node = {}; // jshint ignore:line

export { Pathfinding };
