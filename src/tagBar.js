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

function TagBar() {
    this._init();
}

TagBar.prototype = {
    _init: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     hexpand: true,
                                     valign: Gtk.Align.END,
                                     margin_left: 12,
                                     margin_right: 12,
                                     margin_bottom: 12,
                                     column_spacing: 6,
                                     border_width: 6 });

        this._tagLabel = new Gtk.Label({ halign: Gtk.Align.START });
        this.widget.add(this._tagLabel);

        this._tagEntry = new Gtk.Entry({ hexpand: true });
        this.widget.add(this._tagEntry);
    },

    setSelection: function(selection) {
        if (selection.length > 0) {
            this.widget.show();
            this._tagLabel.label = _('%d selected documents').format(selection.length);
        } else {
            this.widget.hide();
        }
    }
}