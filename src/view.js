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
const Signals = imports.signals;

const Documents = imports.documents;
const Global = imports.global;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;

function ContextMenu(urn, isFavorite) {
    this._init(urn, isFavorite);
}

ContextMenu.prototype = {
    _init: function(urn, isFavorite) {
        this._urn = urn;
        this._isFavorite = isFavorite;

        this.widget = new Gtk.Menu();

        let favoriteLabel = (isFavorite) ? _("Remove from favorites") : _("Add to favorites");
        let favoriteItem = new Gtk.MenuItem({ label: favoriteLabel });
        favoriteItem.show();
        this.widget.append(favoriteItem);

        favoriteItem.connect('activate', Lang.bind(this,
            function() {
                TrackerUtils.setFavorite(this._urn, !this._isFavorite, null);
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

        this._model = new Documents.DocumentModel();
        this._treeModel = this._model.model;
        this.widget.set_model(this._treeModel);

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                Global.selectionController.disconnect(this._selectionControllerId);
            }));
        this.widget.connect('button-release-event', Lang.bind(this, this._onButtonRelease));

        this.createRenderers();

        this._selectionController = Global.selectionController;
        this._selectionControllerId =
            this._selectionController.connect('selection-check',
                                              Lang.bind(this, this._updateSelection));

        this._updateSelection();

        this.connectToSelectionChanged(Lang.bind(this, this._onSelectionChanged));
    },

    _updateSelection: function() {
        let selectionObject = this.getSelectionObject();
        let selected = this._selectionController.getSelection().slice(0);

        if (!selected.length)
            return;

        this._treeModel.foreach(Lang.bind(this,
            function(model, path, iter) {
                let urn = this._treeModel.get_value(iter, Documents.ModelColumns.URN);
                let urnIndex = selected.indexOf(urn);

                if (urnIndex != -1) {
                    selectionObject.select_path(path);
                    selected.splice(urnIndex, 1);
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

    _onButtonRelease: function(view, event) {
        let button = Gd.gdk_event_get_button(event);
        let position = Gd.gdk_event_get_position(event);
        let timestamp = event.get_time();

        if (button != 3)
            return false;

        let path = this.getPathAtPos(position);
        let iter = this._treeModel.get_iter(path)[1];

        let urn = this._treeModel.get_value(iter, Documents.ModelColumns.URN);
        let isFavorite = this._treeModel.get_value(iter, Documents.ModelColumns.FAVORITE);

        let menu = new ContextMenu(urn, isFavorite);
        menu.widget.popup_for_device(null, null, null, null, null, null, button, timestamp);

        return true;
    },

    // this must be overridden by all implementations
    createRenderers: function() {
        throw new Error('Missing implementation of createRenderers in ' + this);
    },

    activateItem: function(path) {
        let iter = this._treeModel.get_iter(path)[1];
        let uri = this._treeModel.get_value(iter, Documents.ModelColumns.URI);
        let resource = this._treeModel.get_value(iter, Documents.ModelColumns.RESOURCE_URN);

        this.emit('item-activated', uri, resource);
    }
};
Signals.addSignalMethods(View.prototype);
