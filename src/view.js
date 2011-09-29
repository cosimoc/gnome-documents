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

const Gd = imports.gi.Gd;
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
                let doc = Global.documentManager.lookupDocument(urn);
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

        this._treeModel = Global.documentManager.getModel().model;
        this.widget.set_model(this._treeModel);

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                Global.selectionController.disconnect(this._selectionControllerId);
            }));
        this.widget.connect('button-release-event', Lang.bind(this, this._onButtonReleaseEvent));
        this.widget.connect('button-press-event', Lang.bind(this, this._onButtonPressEvent));

        this.createRenderers();

        this._selectionController = Global.selectionController;
        this._selectionControllerId =
            this._selectionController.connect('selection-check',
                                              Lang.bind(this, this._updateSelection));

        // HACK: give the view some time to setup the scrolled window
        // allocation, as updateSelection() might call scrollToPath().
        // Is there anything better we can do here?
        Mainloop.timeout_add(100, Lang.bind(this,
            function() {
                this._updateSelection();
                return false;
            }));

        this.connectToSelectionChanged(Lang.bind(this, this._onSelectionChanged));
    },

    _updateSelection: function() {
        let selectionObject = this.getSelectionObject();
        let selected = this._selectionController.getSelection().slice(0);

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

    _onSelectionChanged: function() {
        let selectedURNs = Utils.getURNsFromPaths(this.getSelection(),
                                                  this._treeModel);
        Global.selectionController.setSelection(selectedURNs);
    },

    _onButtonPressEvent: function(widget, event) {
        let button = event.get_button()[1];
        if (button != 3)
            return false;

        let coords = [ event.get_coords()[1] , event.get_coords()[2] ];
        let path = this.getPathAtPos(coords);

        let selection = Global.selectionController.getSelection();

        if (path) {
            let urn = Utils.getURNFromPath(path, this._treeModel);

            if (selection.indexOf(urn) == -1)
                this.getSelectionObject().unselect_all();

            this.getSelectionObject().select_path(path);
        }

        return true;
    },

    _onButtonReleaseEvent: function(view, event) {
        let button = event.get_button()[1];
        let coords = [ event.get_coords()[1] , event.get_coords()[2] ];
        let timestamp = event.get_time();

        if (button != 3)
            return false;

        let path = this.getPathAtPos(coords);

        if (!path)
            return false;

        let iter = this._treeModel.get_iter(path)[1];

        let urn = this._treeModel.get_value(iter, Documents.ModelColumns.URN);
        let menu = new ContextMenu(Global.selectionController.getSelection());

        menu.widget.popup_for_device(null, null, null, null, null, null, button, timestamp);

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
