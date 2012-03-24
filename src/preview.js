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

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const Lang = imports.lang;

const Global = imports.global;
const Tweener = imports.util.tweener;
const View = imports.view;

function PreviewView(model) {
    this._init(model);
}

PreviewView.prototype = {
    _init: function(model) {
        this._model = model;

        this.widget = EvView.View.new();
        this.widget.set_model(this._model);
        this.widget.show();

        this.widget.connect('button-press-event',
                            Lang.bind(this, this._onButtonPressEvent));
        this.widget.connect('button-release-event',
                            Lang.bind(this, this._onButtonReleaseEvent));
        this.widget.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));
    },

    _onKeyPressEvent: function(widget, event) {
        let keyval = event.get_keyval()[1];

        if (keyval == Gdk.KEY_space) {
            this.widget.scroll(Gtk.ScrollType.PAGE_FORWARD, false);
            return true;
        }

        return false;
     },

    _onButtonReleaseEvent: function(widget, event) {
        let button = event.get_button()[1];
        let timestamp = event.get_time();

        if (button != 3)
            return false;

        let doc = Global.documentManager.getActiveItem();
        let menu = new View.ContextMenu([ doc.id ]);

        menu.widget.popup_for_device(null, null, null, null, null, null, button, timestamp);

        return true;
    },

    _onButtonPressEvent: function(widget, event) {
        let button = event.get_button()[1];
        let clickCount = event.get_click_count()[1];

        if (button == 1 && clickCount == 2) {
            Global.modeController.toggleFullscreen();
            return true;
        }

        return false;
    },

    destroy: function() {
        this.widget.destroy();
    }
};

function PreviewThumbnails(model) {
    this._init(model);
}

PreviewThumbnails.prototype = {
    _init: function(model) {
        this.view = new Gd.SidebarThumbnails({ model: model });
        this.widget = new Gd.ThumbNav({ thumbview: this.view });
        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 0 });

        this.widget.show_all();
    },

    show: function() {
        this.actor.show();

        Tweener.addTween(this.actor,
            { opacity: 255,
              time: 0.30,
              transition: 'easeOutQuad' });
    },

    hide: function() {
        Tweener.addTween(this.actor,
            { opacity: 0,
              time: 0.30,
              transition: 'easeOutQuad',
              onComplete: function() {
                  this.actor.hide();
              },
              onCompleteScope: this });
    }
};

function PreviewEmbed(model, layout, parentActor) {
    this._init(model, layout, parentActor);
}

PreviewEmbed.prototype = {
    _init: function(model, layout, parentActor) {
        this._layout = layout;
        this._parentActor = parentActor;

        this.thumbBar = new PreviewThumbnails(model);
        this.actor = this.thumbBar.actor;

        this._layout.add(this.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        let widthConstraint =
            new Clutter.BindConstraint({ source: this._parentActor,
                                         coordinate: Clutter.BindCoordinate.WIDTH,
                                         offset: - 300 });
        this.actor.add_constraint(widthConstraint);
        this.actor.connect('notify::width', Lang.bind(this,
            function() {
                let width = this._parentActor.width;
                let offset = 300;

                if (width > 1000)
                    offset += (width - 1000);
                else if (width < 600)
                    offset -= (600 - width);

                widthConstraint.offset = - offset;
            }));

        this.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.X_AXIS,
                                          source: this._parentActor,
                                          factor: 0.50 }));
        this.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.Y_AXIS,
                                          source: this._parentActor,
                                          factor: 0.95 }));
    }
};
