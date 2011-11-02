/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Documents = imports.documents;
const Global = imports.global;
const TrackerUtils = imports.trackerUtils;
const WindowMode = imports.windowMode;
const Utils = imports.utils;

function ContextMenu(urns) {
    this._init(urns);
}

ContextMenu.prototype = {
    _init: function(urns) {
        let favCount = 0;
        let apps = [];
        let docs = [];

        this.widget = new Gtk.Menu();
        let showFavorite = (Global.modeController.getWindowMode() != WindowMode.WindowMode.PREVIEW);

        urns.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                if (doc.favorite)
                    favCount++;

                if (apps.indexOf(doc.defaultAppName) == -1) {
                    apps.push(doc.defaultAppName);
                }

                docs.push(doc);
            }));

        showFavorite &= ((favCount == 0) || (favCount == urns.length));

        let openLabel = null;
        if (apps.length == 1) {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open with %s").format(apps[0]);
        } else {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open");
        }

        let openItem = new Gtk.MenuItem({ label: openLabel });
        openItem.show();
        this.widget.append(openItem);

        let favoriteItem = null;
        if (showFavorite) {
            let isFavorite = (favCount == urns.length);
            let favoriteLabel = (isFavorite) ? _("Remove from favorites") : _("Add to favorites");

            favoriteItem = new Gtk.MenuItem({ label: favoriteLabel });
            favoriteItem.show();
            this.widget.append(favoriteItem);
        }

        docs.forEach(Lang.bind(this,
            function(doc) {
                openItem.connect('activate', Lang.bind(this,
                    function(item) {
                        doc.open(item.get_screen(), Gtk.get_current_event_time());
                    }));

                if (favoriteItem) {
                    favoriteItem.connect('activate', Lang.bind(this,
                        function() {
                            doc.setFavorite(!doc.favorite);
                        }));
                }
            }));

        this.widget.show_all();
    }
};

function View() {
    this._init();
}

View.prototype = {
    _init: function() {
        this._selectedURNs = null;
        this._updateSelectionId = 0;

        // setup selections
        this.setSingleClickMode(true);

        // create renderers
        this.createRenderers();

        // setup selections view => controller
        this.setSelectionMode(Gtk.SelectionMode.SINGLE);
        this.connectToSelectionChanged(Lang.bind(this, this._onSelectionChanged));

        // setup selection controller => view
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._onSelectionModeChanged));
        this._queryId =
            Global.trackerController.connect('query-status-changed',
                                             Lang.bind(this, this._onQueryStatusChanged));

        this.widget.connect('button-press-event',
                            Lang.bind(this, this._onButtonPressEvent));
        this.widget.connect('destroy', Lang.bind(this,
            function() {
                // save selection when the view is destroyed
                Global.selectionController.freezeSelection(true);

                if (this._updateSelectionId != 0) {
                    Mainloop.source_remove(this._updateSelectionId);
                    this._updateSelectionId = 0;
                }

                Global.trackerController.disconnect(this._queryId);
                Global.selectionController.disconnect(this._selectionModeId);
            }));

        // this will create the model if we're done querying
        this._onQueryStatusChanged();
        this.widget.show();
    },

    _onQueryStatusChanged: function() {
        let status = Global.trackerController.getQueryStatus();

        if (!status) {
            // setup a model if we're not querying
            this._treeModel = Global.documentManager.getModel().model;
            this.widget.set_model(this._treeModel);

            // unfreeze selection
            Global.selectionController.freezeSelection(false);

            // HACK: give the view some time to setup the scrolled window
            // allocation, as updateSelection() might call scrollToPath().
            // Is there anything better we can do here?
            this._updateSelectionId =
                Mainloop.timeout_add(100, Lang.bind(this,
                    function() {
                        this._updateSelectionId = 0;
                        this._updateSelection();
                        return false;
                    }));
        } else {
            // save the last selection
            Global.selectionController.freezeSelection(true);

            // if we're querying, clear the model from the view,
            // so that we don't uselessly refresh the rows
            this._treeModel = null;
            this.widget.set_model(null);
        }
    },

    _updateSelection: function() {
        let selectionObject = this.getSelectionObject();
        let selected = Global.selectionController.getSelection().slice(0);

        if (!selected.length)
            return;

        let first = true;
        this._treeModel.foreach(Lang.bind(this,
            function(model, path, iter) {
                let urn = this._treeModel.get_value(iter, Documents.ModelColumns.URN);
                let urnIndex = selected.indexOf(urn);

                if (urnIndex != -1) {
                    selectionObject.select_path(path);
                    selected.splice(urnIndex, 1);

                    if (first) {
                        this.scrollToPath(path);
                        first = false;
                    }
                }

                if (selected.length == 0)
                    return true;

                return false;
            }));
    },

    _onSelectionModeChanged: function(controller, selectionMode) {
        // setup the GtkSelectionMode of the view according to whether or not
        // the view is in "selection mode"
        if (selectionMode) {
            this.setSingleClickMode(false);
            this.setSelectionMode(Gtk.SelectionMode.MULTIPLE);
        } else {
            this.setSingleClickMode(true);
            this.setSelectionMode(Gtk.SelectionMode.SINGLE);
        }
    },

    _onSelectionChanged: function() {
        // update the selection on the controller when the view signals a change
        let selectedURNs = Utils.getURNsFromPaths(this.getSelection(),
                                                  this._treeModel);
        Global.selectionController.setSelection(selectedURNs);
    },

    _onButtonPressEvent: function(widget, event) {
        let button = event.get_button()[1];
        let enteredMode = false;

        if (!Global.selectionController.getSelectionMode()) {
            if (button == 3) {
                Global.selectionController.setSelectionMode(true);
                enteredMode = true;
            } else {
                return false;
            }
        }

        let coords = [ event.get_coords()[1] , event.get_coords()[2] ];
        let path = this.getPathAtPos(coords);

        if (path) {
            let selectionObj = this.getSelectionObject();
            let isSelected = selectionObj.path_is_selected(path);

            if (isSelected && !enteredMode)
                selectionObj.unselect_path(path);
            else if (!isSelected)
                selectionObj.select_path(path);
        }

        return true;
    },

    // this must be overridden by all implementations
    createRenderers: function() {
        throw new Error('Missing implementation of createRenderers in ' + this);
    },

    activateItem: function(path) {
        let iter = this._treeModel.get_iter(path)[1];
        let urn = this._treeModel.get_value(iter, Documents.ModelColumns.URN);

        this.emit('item-activated', urn);
    }
};
Signals.addSignalMethods(View.prototype);
