define(['readium_js_plugins', 'readium_shared_js/globals', 'readium_shared_js/models/bookmark_data'], function (Plugins, Globals, BookmarkData) {
    Plugins.register("boundaryCrossCheck", ["highlights"], function (api) {
        var reader = api.reader, _highlightsManager = reader.plugins.highlights.getHighlightsManager();

        var self = this;

        // initial value undefined, so that we do not do any boundary checks
        var _boundaryData = undefined;

        /**
         * Sets a "boundary CFI" that defines the boundary, that can not be crossed
         while rendering a book.
         * @param {string} spineItemIdref Spine idref that defines the partial Cfi
         * @param {string} cfi            Partial CFI (withouth the indirection step) relative
         to the spine index
         */
        this.setRenderingRestriction = function (spineItemIdref, cfi) {
            // if content CFI is a range CFI, replace it with the start CFI of the range
            var startCfi = cfi;
            var comps = cfi.split(",");
            if (comps.length > 0) {
                startCfi = comps[0] + comps[1];
            }

            // set boundary
            _boundaryData = {
                bookmark: new BookmarkData(spineItemIdref, startCfi),
                spineItem: reader.spine().getItemById(spineItemIdref)
            };
        };

        /**
         * Clears book rendering restrictions
         */
        this.clearRenderingRestriction = function () {
            // clear boundary
            _boundaryData = undefined;

            // make current page visible
            reader.getCurrentView().show();
        };

        // helper function to restrict rendering
        this.boundaryCrossed = function () {
            console.log("boundaryCrossed");

            // make current page invisible
            reader.getCurrentView().hide();

            // raise event that indicates boundary violation
            self.emit('BoundaryCrossed');
        };

        // constructor
        var BoundaryChecker = function()
        {

            // set PAGINATION_CHANGED handler to check if we "crossed the boundary"
            // PAGINATION_CHANGED happened when we sequentially go through pages
            // or  when we jump to the bookmark
            reader.on(Globals.Events.PAGINATION_CHANGED, function (pageChangeData) {

                // if boundary is set (rendering rerstricted)
                if (_boundaryData) {

                    // get open pages array (for "fixed" with spread we may have
                    // several spine items rendered, so go through all of them)
                    var pages = pageChangeData.paginationInfo.openPages;
                    for(var i = 0; i < pages.length; i++) {
                        page = pages[i];

                        if (page.spineItemIndex < _boundaryData.spineItem.index)
                            continue;
                        if (page.spineItemIndex > _boundaryData.spineItem.index) {
                            self.boundaryCrossed();
                            return;
                        }

                        // current spine item id ref is the same as "boundary's"

                        // get first and last visible CFIs
                        var visibleCfis = reader.getCfisForVisibleRegion();

                        // check if boundary content CFI is within the page that was just open
                        if (_highlightsManager.cfiIsBetweenTwoCfis(_boundaryData.bookmark.contentCFI,
                                visibleCfis.firstVisibleCfi.contentCFI,
                                visibleCfis.lastVisibleCfi.contentCFI)) {
                            self.boundaryCrossed();
                            return;
                        }

                        // check if pages's first visible CFI is greater than the boundary
                        var result = _highlightsManager.contentCfiComparator(
                            visibleCfis.firstVisibleCfi.contentCFI,
                            _boundaryData.bookmark.contentCFI);
                        if (result >= 0) {
                            self.boundaryCrossed();
                            return;
                        }
                    }
                }
            });
        };

        this.boundaryChecker = new BoundaryChecker();
    });
});
