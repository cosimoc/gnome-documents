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

const Global = imports.global;

const Gettext = imports.gettext;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;

function LoadMoreButton() {
    this._init();
};

LoadMoreButton.prototype = {
    _init: function() {
        this._block = false;

        this._controller = Global.offsetController;
        this._controllerId =
            this._controller.connect('item-count-changed',
                                     Lang.bind(this, this._onItemCountChanged));

        this.widget = new Gtk.Button({ no_show_all: true });
        this.widget.get_style_context().add_class('documents-load-more');
        this.widget.connect('clicked', Lang.bind(this,
            function() {
                this._controller.increaseOffset();
            }));

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                this._controller.disconnect(this._controllerId);
            }));

        this._onItemCountChanged();
    },

    _onItemCountChanged: function() {
        let remainingDocs = this._controller.getRemainingDocs();
        let offsetStep = this._controller.getOffsetStep();

        if (remainingDocs <= 0 || this._block) {
            this.widget.hide();
            return;
        }

        if (remainingDocs > offsetStep)
            remainingDocs = offsetStep;

        this.widget.label = Gettext.ngettext("Load %d more document",
                                             "Load %d more documents",
                                             remainingDocs).format(remainingDocs);
        this.widget.show();
    },

    setBlock: function(block) {
        if (this._block == block)
            return;

        this._block = block;
        this._onItemCountChanged();
    }
};
