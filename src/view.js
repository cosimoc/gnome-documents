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
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

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

        this.widget = new Gd.MainView();

        this.widget.connect('item-activated',
                            Lang.bind(this, this._onItemActivated));
        this.widget.connect('selection-mode-request',
                            Lang.bind(this, this._onSelectionModeRequest));
        this.widget.connect('notify::view-type',
                            Lang.bind(this, this._onViewTypeChanged));

        // connect to settings change for list/grid view
        this._viewSettingsId =
            Global.settings.connect('changed::list-view',
                                    Lang.bind(this, this._updateTypeForSettings));
        this._updateTypeForSettings();

        // setup selection controller => view
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._onSelectionModeChanged));
        this._onSelectionModeChanged();

        this._queryId =
            Global.trackerController.connect('query-status-changed',
                                             Lang.bind(this, this._onQueryStatusChanged));

        // this will create the model if we're done querying
        this._onQueryStatusChanged();
        this.widget.show();
    },

    _updateTypeForSettings: function() {
        let isList = Global.settings.get_boolean('list-view');
        let viewType = Gd.MainViewType.ICON;
        if (isList)
            viewType = Gd.MainViewType.LIST;

        this.widget.set_view_type(viewType);
    },

    _addListRenderers: function() {
        let listWidget = this.widget.get_generic_view();

        let typeRenderer =
            new Gtk.CellRendererText({ xpad: 16 });
        listWidget.add_renderer(typeRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let urn = model.get_value(iter, Documents.ModelColumns.URN);
                let doc = Global.documentManager.getItemById(urn);

                typeRenderer.text = doc.typeDescription;
            }));

        let whereRenderer =
            new Gtk.CellRendererText({ xpad: 8 });
        listWidget.add_renderer(whereRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let urn = model.get_value(iter, Documents.ModelColumns.URN);
                let doc = Global.documentManager.getItemById(urn);

                whereRenderer.text = doc.sourceName;
            }));
    },

    _onViewTypeChanged: function() {
        if (this.widget.get_view_type() == Gd.MainViewType.LIST)
            this._addListRenderers();

        // setup selections view => controller
        let generic = this.widget.get_generic_view();
        generic.connect('view-selection-changed', Lang.bind(this, this._onSelectionChanged));

        Global.selectionController.freezeSelection(false);

        generic.connect('destroy', Lang.bind(this,
            function() {
                // save selection when the view is destroyed
                Global.selectionController.freezeSelection(true);
            }));
    },

    _onSelectionModeRequest: function() {
        Global.selectionController.setSelectionMode(true);
    },

    _onItemActivated: function(widget, id) {
        Global.documentManager.setActiveItemById(id);
    },

    _onQueryStatusChanged: function() {
        let status = Global.trackerController.getQueryStatus();

        if (!status) {
            // setup a model if we're not querying
            this._treeModel = Global.documentManager.getModel().model;
            this.widget.set_model(this._treeModel);

            // unfreeze selection
            Global.selectionController.freezeSelection(false);
            this._updateSelection();
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
        let selected = Global.selectionController.getSelection().slice(0);

        if (!selected.length)
            return;

        let generic = this.widget.get_generic_view();
        let first = true;
        this._treeModel.foreach(Lang.bind(this,
            function(model, path, iter) {
                let urn = this._treeModel.get_value(iter, Documents.ModelColumns.URN);
                let urnIndex = selected.indexOf(urn);

                if (urnIndex != -1) {
                    generic.select_path(path);
                    selected.splice(urnIndex, 1);

                    if (first) {
                        generic.scrollToPath(path);
                        first = false;
                    }
                }

                if (selected.length == 0)
                    return true;

                return false;
            }));
    },

    _onSelectionModeChanged: function() {
        let selectionMode = Global.selectionController.getSelectionMode();
        this.widget.set_selection_mode(selectionMode);
    },

    _onSelectionChanged: function() {
        let generic = this.widget.get_generic_view();

        // update the selection on the controller when the view signals a change
        let selectedURNs = Utils.getURNsFromPaths(generic.get_selection(),
                                                  this._treeModel);
        Global.selectionController.setSelection(selectedURNs);
    }
};
