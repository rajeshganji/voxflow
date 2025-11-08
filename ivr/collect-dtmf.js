/**
 * Copyright (c) 2010-2011 Ozonetel Pvt Ltd.
 * 
 * CollectDtmf class for handling DTMF input collection in KooKoo IVR
 */

const { DOMImplementation, XMLSerializer } = require('xmldom');
const implementation = new DOMImplementation();

class CollectDtmf {
    constructor(maxDigits = 1, terminateChar = '#', timeout = 5000) {
        this.doc = implementation.createDocument(null, 'collectdtmf', null);
        this.collectdtmf = this.doc.documentElement;
        
        // Set attributes
        this.collectdtmf.setAttribute('l', maxDigits.toString());
        this.collectdtmf.setAttribute('t', terminateChar);
        this.collectdtmf.setAttribute('o', timeout.toString());
    }

    /**
     * Add play text instruction
     * @param {string} text - Text to be spoken
     * @param {number} speed - Speech speed (1-9)
     * @param {string} lang - Language code (EN, HI, etc.)
     * @param {string} quality - Audio quality (best, good, normal)
     */
    addPlayText(text, speed = 2, lang = 'EN', quality = 'best') {
        const playText = this.doc.createElement('playtext');
        playText.textContent = text;
        playText.setAttribute('lang', lang);
        playText.setAttribute('type', 'ggl');
        playText.setAttribute('speed', speed.toString());
        playText.setAttribute('quality', quality);
        this.collectdtmf.appendChild(playText);
    }

    /**
     * Add play audio instruction
     * @param {string} url - URL of the audio file to play
     */
    addPlayAudio(url) {
        const playAudio = this.doc.createElement('playaudio');
        playAudio.textContent = url;
        this.collectdtmf.appendChild(playAudio);
    }

    /**
     * Add Say-As instruction for formatted speech
     * @param {string} text - Text to be spoken
     * @param {number} formatCode - Format code for speech
     * @param {string} lang - Language code
     */
    addSayAs(text, formatCode = 501, lang = 'EN') {
        const sayAs = this.doc.createElement('Say-As');
        sayAs.textContent = text;
        sayAs.setAttribute('format', formatCode.toString());
        sayAs.setAttribute('lang', lang);
        this.collectdtmf.appendChild(sayAs);
    }

    /**
     * Set maximum number of digits to collect
     * @param {number} maxDigits - Maximum digits
     */
    setMaxDigits(maxDigits) {
        this.collectdtmf.setAttribute('l', maxDigits.toString());
    }

    /**
     * Set termination character
     * @param {string} terminateChar - Character that terminates input
     */
    setTerminateChar(terminateChar) {
        this.collectdtmf.setAttribute('t', terminateChar);
    }

    /**
     * Set timeout in milliseconds
     * @param {number} timeout - Timeout in milliseconds
     */
    setTimeout(timeout) {
        this.collectdtmf.setAttribute('o', timeout.toString());
    }

    /**
     * Get the root element for importing into Response
     * @returns {Element} The collectdtmf element
     */
    getRoot() {
        return this.collectdtmf;
    }

    /**
     * Get XML string representation
     * @returns {string} XML string
     */
    getXML() {
        const serializer = new XMLSerializer();
        return serializer.serializeToString(this.doc);
    }
}

module.exports = CollectDtmf;