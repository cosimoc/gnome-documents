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
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
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
        this.widget = new Gd.MainView();

        this.widget.connect('item-activated',
                            Lang.bind(this, this._onItemActivated));
        this.widget.connect('selection-mode-request',
                            Lang.bind(this, this._onSelectionModeRequest));
        this.widget.connect('view-selection-changed',
                            Lang.bind(this, this._onViewSelectionChanged));

        // connect to settings change for list/grid view
        this._viewSettingsId =
            Global.settings.connect('changed::view-as',
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
        // ensure the tracker controller is started
        Global.trackerController.start();

        // this will create the model if we're done querying
        this._onQueryStatusChanged();
        this.widget.show();
    },

    _updateTypeForSettings: function() {
        let viewType = Global.settings.get_enum('view-as');
        this.widget.set_view_type(viewType);

        if (viewType == Gd.MainViewType.LIST)
            this._addListRenderers();
    },

    _addListRenderers: function() {
        let listWidget = this.widget.get_generic_view();

        let typeRenderer =
            new Gd.StyledTextRenderer({ xpad: 16 });
        typeRenderer.add_class('dim-label');
        listWidget.add_renderer(typeRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);
                let doc = Global.documentManager.getItemById(id);

                typeRenderer.text = doc.typeDescription;
            }));

        let whereRenderer =
            new Gd.StyledTextRenderer({ xpad: 16 });
        whereRenderer.add_class('dim-label');
        listWidget.add_renderer(whereRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);
                let doc = Global.documentManager.getItemById(id);

                whereRenderer.text = doc.sourceName;
            }));

        let dateRenderer =
            new Gtk.CellRendererText({ xpad: 32 });
        listWidget.add_renderer(dateRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);
                let doc = Global.documentManager.getItemById(id);
                let DAY = 86400000000;

                let now = GLib.DateTime.new_now_local();
                let mtime = GLib.DateTime.new_from_unix_local(doc.mtime);
                let difference = now.difference(mtime);
                let days = Math.floor(difference / DAY);
                let weeks = Math.floor(difference / (7 * DAY));
                let months = Math.floor(difference / (30 * DAY));
                let years = Math.floor(difference / (365 * DAY));

                if (difference < DAY) {
                    dateRenderer.text = mtime.format('%X');
                } else if (difference < 2 * DAY) {
                    dateRenderer.text = _("Yesterday");
                } else if (difference < 7 * DAY) {
                    dateRenderer.text = Gettext.ngettext("%d day ago",
                                                         "%d days ago",
                                                         days).format(days);
                } else if (difference < 14 * DAY) {
                    dateRenderer.text = _("Last week");
                } else if (difference < 28 * DAY) {
                    dateRenderer.text = Gettext.ngettext("%d week ago",
                                                         "%d weeks ago",
                                                         weeks).format(weeks);
                } else if (difference < 60 * DAY) {
                    dateRenderer.text = _("Last month");
                } else if (difference < 360 * DAY) {
                    dateRenderer.text = Gettext.ngettext("%d month ago",
                                                         "%d months ago",
                                                         months).format(months);
                } else if (difference < 730 * DAY) {
                    dateRenderer.text = _("Last year");
                } else {
                    dateRenderer.text = Gettext.ngettext("%d year ago",
                                                         "%d years ago",
                                                         years).format(years);
                }
            }));
    },

    _onSelectionModeRequest: function() {
        Global.selectionController.setSelectionMode(true);
    },

    _onItemActivated: function(widget, id, path) {
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
        let selected = Global.selectionController.getSelection();
        let newSelection = [];

        if (!selected.length)
            return;

        let generic = this.widget.get_generic_view();
        let first = true;
        this._treeModel.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = this._treeModel.get_value(iter, Gd.MainColumns.ID);
                let idIndex = selected.indexOf(id);

                if (idIndex != -1) {
                    this._treeModel.set_value(iter, Gd.MainColumns.SELECTED, true);
                    newSelection.push(id);

                    if (first) {
                        generic.scroll_to_path(path);
                        first = false;
                    }
                }

                if (newSelection.length == selected.length)
                    return true;

                return false;
            }));

        Global.selectionController.setSelection(newSelection);
    },

    _onSelectionModeChanged: function() {
        let selectionMode = Global.selectionController.getSelectionMode();
        this.widget.set_selection_mode(selectionMode);
    },

    _onViewSelectionChanged: function() {
        // update the selection on the controller when the view signals a change
        let selectedURNs = Utils.getURNsFromPaths(this.widget.get_selection(),
                                                  this._treeModel);
        Global.selectionController.setSelection(selectedURNs);
    }
};
