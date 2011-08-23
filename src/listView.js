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
const Gd = imports.gi.Gd;
const Pango = imports.gi.Pango;

const TrackerModel = imports.trackerModel;
const View = imports.view;
const Lang = imports.lang;

function ListView(window) {
    this._init(window);
}

ListView.prototype = {
    __proto__: View.View.prototype,

    _init: function(window) {
        View.View.prototype._init.call(this, window);

        this.widget = new Gtk.TreeView({ hexpand: true,
                                         vexpand: true,
                                         headers_visible: false });

        this.widget.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE);

        this.widget.connect('row-activated',
                            Lang.bind(this, this._onItemActivated));

        this.widget.show();
    },

    _onItemActivated: function(view, path, column) {
        this.activateItem(path);
    },

    preUpdate: function() {
        let treeSelection = this.widget.get_selection();
        let selection = this.widget.get_selected_rows();

        View.View.prototype.preUpdate.call(this, selection);
    },

    postUpdate: function() {
        if (!this._selectedURNs)
            return;

        let treeSelection = this.widget.get_selection();

        this._treeModel.foreach(Lang.bind(this,
            function(model, path, iter) {
                let urn = this._treeModel.get_value(iter, TrackerModel.ModelColumns.URN);
                let urnIndex = this._selectedURNs.indexOf(urn);

                if (urnIndex != -1) {
                    treeSelection.select_path(path);
                    this._selectedURNs.splice(urnIndex, 1);
                }

                if (this._selectedURNs.length == 0)
                    return true;

                return false;
            }));

        View.View.prototype.postUpdate.call(this);
    },

    createRenderers: function() {
        let col = new Gtk.TreeViewColumn();
        this.widget.append_column(col);

        let pixbufRenderer =
            new Gd.FramedPixbufRenderer({ xalign: 0.5,
                                          yalign: 0.5 });

        col.pack_start(pixbufRenderer, false);
        col.add_attribute(pixbufRenderer,
                          'pixbuf', TrackerModel.ModelColumns.ICON);

        let textRenderer =
            new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                      wrap_mode: Pango.WrapMode.WORD_CHAR,
                                      xalign: 0.5,
                                      yalign: 0.0,
                                      xpad: 12,
                                      text_lines: 3 });
        col.pack_start(textRenderer, false);
        col.add_attribute(textRenderer,
                          'text', TrackerModel.ModelColumns.TITLE);
        col.add_attribute(textRenderer,
                          'line-two', TrackerModel.ModelColumns.AUTHOR);
    }
}