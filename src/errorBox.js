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

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const Lang = imports.lang;
const Tweener = imports.util.tweener;

const _ICON_SIZE = 128;

const ErrorBox = new Lang.Class({
    Name: 'ErrorBox',

    _init: function(primary, secondary) {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     row_spacing: 12,
                                     hexpand: true,
                                     vexpand: true,
                                     halign: Gtk.Align.CENTER,
                                     valign: Gtk.Align.CENTER });

        this._image = new Gtk.Image({ pixel_size: _ICON_SIZE,
                                      icon_name: 'dialog-error',
                                      halign: Gtk.Align.CENTER,
                                      valign: Gtk.Align.CENTER });

        this.widget.add(this._image);

        this._primaryLabel =
            new Gtk.Label({ label: '',
                            use_markup: true,
                            halign: Gtk.Align.CENTER,
                            valign: Gtk.Align.CENTER });
        this.widget.add(this._primaryLabel);

        this._secondaryLabel =
            new Gtk.Label({ label: '',
                            use_markup: true,
                            halign: Gtk.Align.CENTER,
                            valign: Gtk.Align.CENTER });
        this.widget.add(this._secondaryLabel);

        this.widget.show_all();

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 255 });
    },

    update: function(primary, secondary) {
        let primaryMarkup = '<big><b>' + GLib.markup_escape_text(primary, -1) + '</b></big>';
        let secondaryMarkup = GLib.markup_escape_text(secondary, -1);

        this._primaryLabel.label = primaryMarkup;
        this._secondaryLabel.label = secondaryMarkup;
    },

    moveIn: function() {
        this.actor.raise_top();

        Tweener.addTween(this.actor, { opacity: 255,
                                       time: 0.30,
                                       transition: 'easeOutQuad' });
    },

    moveOut: function() {
        Tweener.addTween(this.actor, { opacity: 0,
                                       time: 0.30,
                                       transition: 'easeOutQuad',
                                       onComplete: function () {
                                           this.actor.lower_bottom();
                                       },
                                       onCompleteScope: this });
    }
});
