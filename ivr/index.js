/**
 * VoxFlow IVR Components
 * 
 * This module provides KooKoo-compatible IVR components for building
 * voice applications with AI integration.
 */

const Response = require('./response');
const CollectDtmf = require('./collect-dtmf');
const IVRFlow = require('./ivrflow');

module.exports = {
    Response,
    CollectDtmf,
    IVRFlow
};