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

const _SPINNER_SIZE = 125;

function SpinnerBox() {
    this._init();
}

SpinnerBox.prototype = {
    _init: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     column_spacing: 24,
                                     hexpand: true,
                                     vexpand: true,
                                     halign: Gtk.Align.CENTER,
                                     valign: Gtk.Align.CENTER });

        this._spinner = new Gtk.Spinner({ width_request: _SPINNER_SIZE,
                                          height_request: _SPINNER_SIZE,
                                          halign: Gtk.Align.CENTER,
                                          valign: Gtk.Align.CENTER });
        this._spinner.start();
        this.widget.add(this._spinner);

        this._label = new Gtk.Label({ label: '<big><b>' + _("Loading...") + '</b></big>',
                                      use_markup: true,
                                      halign: Gtk.Align.CENTER,
                                      valign: Gtk.Align.CENTER });
        this.widget.add(this._label);

        this.widget.show_all();
    }
};
