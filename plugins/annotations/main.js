define(['readium_shared_js/plugins_controller', 'readium_shared_js/globals', './annotations_manager'], function (Plugins, Globals, AnnotationsManager) {
    var config = {};

    Plugins.register("annotations", function (api) {
        var reader = api.reader, _annotationsManager, _initialized = false, _initializedLate = false;

        var self = this;

        function isInitialized() {
            if (!_initialized) {
                api.plugin.warn('Not initialized!')
            }
            return _initialized;
        }

        this.initialize = function (options) {

            setTimeout(isInitialized, 1000);

            if (_initialized) {
                api.plugin.warn('Already initialized!');
                return;
            }

            _annotationsManager = new AnnotationsManager(self, options);

            if (_initializedLate) {
                api.plugin.warn('Unable to attach to currently loaded content document.\n' +
                'Initialize the plugin before loading a content document.');
            }

            _initialized = true;
        };

        this.getAnnotationsManager = function() {
            return _annotationsManager;
        };

        /**
         * Returns current selection partial Cfi, useful for workflows that need to check whether the user has selected something.
         *
         * @returns {object | undefined} partial cfi object or undefined if nothing is selected
         */
        this.getCurrentSelectionCfi = function() {
            return _annotationsManager.getCurrentSelectionCfi();
        };

        /**
         * Creates a higlight based on given parameters
         *
         * @param {string} spineIdRef		Spine idref that defines the partial Cfi
         * @param {string} cfi				Partial CFI (withouth the indirection step) relative to the spine index
         * @param {string} id				Id of the highlight. must be unique
         * @param {string} type 			Name of the class selector rule in annotations stylesheet.
         * 									The style of the class will be applied to the created hightlight
         * @param {object} styles			Object representing CSS properties to be applied to the highlight.
         * 									e.g., to apply background color pass in: {'background-color': 'green'}
         *
         * @returns {object | undefined} partial cfi object of the created highlight
         */
        this.addHighlight = function(spineIdRef, cfi, id, type, styles) {
            var options = reader.getCfisForVisibleRegion();
            return _annotationsManager.addHighlight(spineIdRef, cfi, id, type, styles, options);
        };

        /**
         * Draw placeholder around element addressed by CFI
         *
         * @param {string} spineIdRef spine idref that defines the partial Cfi
         * @param {string} cfi Partial CFI (withouth the indirection step) relative to the spine index
         * @param {string} id Id of the highlight. must be unique
         * @param {string} type - name of the class selector rule in annotations.css file.
         * The style of the class will be applied to the placeholder
         * @param {object} styles - object representing CSS properties to be applied to the placeholder
         * e.g., to apply background color pass this {'background-color': 'green'}.
         *
         * @returns {object | undefined} partial cfi object of the created placeholder
         */
        this.addPlaceholder = function(spineIdRef, cfi, id, type, styles) {
            // get element by CFI
            var $element = reader.getCurrentView().getElementByCfi(spineIdRef, cfi);
            if (!$element) {
                return undefined;
            }
            return _annotationsManager.addPlaceholder(spineIdRef, cfi, $element, id, type, styles);
        };

        /**
         * Creates a higlight based on the current selection
         *
         * @param {string} id id of the highlight. must be unique
         * @param {string} type - name of the class selector rule in annotations.css file.
         * @param {boolean} clearSelection - set to true to clear the current selection
         * after it is highlighted
         * The style of the class will be applied to the created hightlight
         * @param {object} styles - object representing CSS properties to be applied to the highlight.
         * e.g., to apply background color pass this {'background-color': 'green'}
         *
         * @returns {object | undefined} partial cfi object of the created highlight
         */
        this.addSelectionHighlight =  function(id, type, clearSelection, styles) {
            return _annotationsManager.addSelectionHighlight(id, type, clearSelection, styles);
        };

        /**
         * Higlights all the occurences of the given text
         *
         * @param {string} text array of text occurences to be highlighted
         * @param {string} spineIdRef spine idref where the text is searched for
         * @param {string} type - name of the class selector rule in annotations.css file.
         * The style of the class will be applied to the created hightlights
         * @param {object} styles - object representing CSS properties to be applied to the highlights.
         * e.g., to apply background color pass this {'background-color': 'green'}.
         *
         * @returns {array<ReadiumSDK.Models.BookmarkData> | undefined} array of bookmarks data for the found text occurences
         */
        this.addHighlightsForText = function(text, spineIdRef, type, styles) {
            return _annotationsManager.addHighlightsForText(text, spineIdRef, type, styles);
        };

        /**
         * Draw placeholders around all "audio" elements in the rendered iFrame
         *
         * @param {string} spineIdRef spine idref where "audio" elements are searched for
         * @param {string} type - name of the class selector rule in annotations.css file.
         * The style of the class will be applied to the placeholders
         * @param {object} styles - object representing CSS properties to be applied to the placeholders.
         * e.g., to apply background color pass this {'background-color': 'green'}.
         *
         * @returns {array<ReadiumSDK.Models.BookmarkData> | undefined} array of bookmarks data for the placeholders
         */
        this.addPlaceholdersForAudio = function(spineIdRef, type, styles) {
            return _annotationsManager.addPlaceholdersForAudio(spineIdRef, type, styles);
        };

        /**
         * Draw placeholders around all "video" elements in the rendered iFrame
         *
         * @param {string} spineIdRef spine idref where "video" elements are searched for
         * @param {string} type - name of the class selector rule in annotations.css file.
         * The style of the class will be applied to the placeholders
         * @param {object} styles - object representing CSS properties to be applied to the placeholders.
         * e.g., to apply background color pass this {'background-color': 'green'}.
         *
         * @returns {array<ReadiumSDK.Models.BookmarkData> | undefined} array of bookmarks data for the placeholders
         */
        this.addPlaceholdersForVideo = function(spineIdRef, type, styles) {
            return _annotationsManager.addPlaceholdersForVideo(spineIdRef, type, styles);
        };

        /**
         * Removes a given highlight
         *
         * @param {string} id  The id associated with the highlight.
         *
         * @returns {undefined}
         *
         */
        this.removeHighlight = function(id) {
            return _annotationsManager.removeHighlight(id);
        };

        /**
         * Removes highlights of a given type
         *
         * @param {string} type type of the highlight.
         *
         * @returns {undefined}
         *
         */
        this.removeHighlightsByType = function(type) {
            return _annotationsManager.removeHighlightsByType(type);
        };

        /**
         * Client Rectangle
         * @typedef {object} ReadiumSDK.Views.ReaderView.ClientRect
         * @property {number} top
         * @property {number} left
         * @property {number} height
         * @property {number} width
         */

        /**
         * Highlight Info
         *
         * @typedef {object} ReadiumSDK.Views.ReaderView.HighlightInfo
         * @property {string} id - unique id of the highlight
         * @property {string} type - highlight type (css class)
         * @property {string} CFI - partial CFI range of the highlight
         * @property {ReadiumSDK.Views.ReaderView.ClientRect[]} rectangleArray - array of rectangles consituting the highlight
         * @property {string} selectedText - concatenation of highlight nodes' text
         */

        /**
         * Gets given highlight
         *
         * @param {string} id id of the highlight.
         *
         * @returns {ReadiumSDK.Views.ReaderView.HighlightInfo} Object describing the highlight
         */
        this.getHighlight = function(id) {
            return _annotationsManager.getHighlight(id);
        };

        /**
         * Update annotation by the id, reapplies CSS styles to the existing annotaion
         *
         * @param {string} id id of the annotation.
         * @property {string} type - annotation type (name of css class)
         * @param {object} styles - object representing CSS properties to be applied to the annotation.
         * e.g., to apply background color pass this {'background-color': 'green'}.
         */
        this.updateAnnotation = function(id, type, styles) {
            _annotationsManager.updateAnnotation(id, type, styles);
        };

        /**
         * Replace annotation with this id. Current annotation is removed and a new one is created.
         *
         * @param {string} id id of the annotation.
         * @property {string} cfi - partial CFI range of the annotation
         * @property {string} type - annotation type (name of css class)
         * @param {object} styles - object representing CSS properties to be applied to the annotation.
         * e.g., to apply background color pass this {'background-color': 'green'}.
         */
        this.replaceAnnotation = function(id, cfi, type, styles) {
            _annotationsManager.replaceAnnotation(id, cfi, type, styles);
        };


        /**
         * Redraws all annotations
         */
        this.redrawAnnotations = function(){
            if (reader.getCurrentView()) {
                var options = reader.getCfisForVisibleRegion();
                _annotationsManager.redrawAnnotations(options);
            }
        };

        /**
         * Updates an annotation to use the supplied styles
         *
         * @param {string} id
         * @param {string} styles
         */
        this.updateAnnotationView = function(id, styles) {
            _annotationsManager.updateAnnotationView(id, styles);
        };

        /**
         * Updates an annotation view state, such as whether its hovered in or not.
         * @param {string} id       The id associated with the highlight.
         * @param {string} state    The state type to be updated
         * @param {string} value    The state value to apply to the highlight
         * @returns {undefined}
         */
        this.setAnnotationViewState = function(id, state, value) {
            return _annotationsManager.setAnnotationViewState(id, state, value);
        };

        /**
         * Updates an annotation view state for all views.
         * @param {string} state    The state type to be updated
         * @param {string} value    The state value to apply to the highlights
         * @returns {undefined}
         */
        this.setAnnotationViewStateForAll = function (state, value) {
            return _annotationsManager.setAnnotationViewStateForAll(state, value);
        };

        /**
         * Gets a list of the visible midpoint positions of all annotations
         *
         * @returns {HTMLElement[]}
         */
        this.getVisibleAnnotationMidpoints = function () {
            var _currentView = reader.getCurrentView();

            if (_currentView) {
                var $visibleElements = _currentView.getVisibleElements(_annotationsManager.getAnnotationsElementSelector(), true);

                var elementMidpoints = _annotationsManager.getAnnotationMidpoints($visibleElements);
                return elementMidpoints || [];
            }
            return [];
        };

        reader.on(Globals.Events.CONTENT_DOCUMENT_LOADED, function ($iframe, spineItem) {
            if (_initialized) {
                _annotationsManager.attachAnnotations($iframe, spineItem, reader.getLoadedSpineItems());
            } else {
                _initializedLate = true;
            }
        });

        ////FIXME: JCCR mj8: this is sometimes faulty, consider removal
        //// automatically redraw annotations.
        //reader.on(ReadiumSDK.Events.PAGINATION_CHANGED, _.debounce(function () {
        //    self.redrawAnnotations();
        //}, 10, true));



    });

    return config;
});
