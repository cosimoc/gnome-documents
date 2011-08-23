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

const Lang = imports.lang;
const Signals = imports.signals;

const Main = imports.main;
const TrackerModel = imports.trackerModel;

function View(window) {
    this._init(window);
}

View.prototype = {
    _init: function(window) {
        this._selectedURNs = null;
        this.window = window;
    },

    destroy: function() {
        this.widget.destroy();
    },

    setModel: function(model) {
        this.model = model;
        this.model.connect('model-update-pending', Lang.bind(this,
            function() {
                this.preUpdate();
            }));
        this.model.connect('model-update-done', Lang.bind(this,
            function() {
                this.postUpdate();
            }));

        this._treeModel = model.model;
        this.widget.set_model(this._treeModel);

        this.createRenderers();
    },

    preUpdate: function(selection) {
        this._selectedURNs = selection.map(Lang.bind(this,
            function(path) {
                let iter = this._treeModel.get_iter(path)[1];
                let urn = this._treeModel.get_value(iter, TrackerModel.ModelColumns.URN);

                return urn;
            }));
    },

    postUpdate: function() {
        this._selectedURNs = null;
    },

    // this must be overridden by all implementations
    createRenderers: function() {
        throw new Error('Missing implementation of createRenderers in ' + this);
    },

    activateItem: function(path) {
        let iter = this._treeModel.get_iter(path)[1];
        let uri = this._treeModel.get_value(iter, TrackerModel.ModelColumns.URI);
        let resource = this._treeModel.get_value(iter, TrackerModel.ModelColumns.RESOURCE_URN);

        this.emit('item-activated', uri, resource);
    }
};
Signals.addSignalMethods(View.prototype);
