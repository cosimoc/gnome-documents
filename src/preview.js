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
const Mainloop = imports.mainloop;

const Global = imports.global;
const Tweener = imports.util.tweener;
const MainToolbar = imports.mainToolbar;
const View = imports.view;

const _FULLSCREEN_TOOLBAR_TIMEOUT = 2; // seconds

const PreviewView = new Lang.Class({
    Name: 'PreviewView',

    _init: function() {
        this._model = null;

        this.widget = new Gtk.ScrolledWindow({ hexpand: true,
                                               vexpand: true,
                                               shadow_type: Gtk.ShadowType.IN });
        this.widget.get_style_context().add_class('documents-scrolledwin');

        this._createView();
        this.widget.show_all();
    },

    _createView: function() {
        this.view = EvView.View.new();
        this.widget.add(this.view);
        this.view.show();

        this.view.connect('button-press-event',
                            Lang.bind(this, this._onButtonPressEvent));
        this.view.connect('button-release-event',
                            Lang.bind(this, this._onButtonReleaseEvent));
        this.view.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));
    },

    _onKeyPressEvent: function(widget, event) {
        let keyval = event.get_keyval()[1];
        let state = event.get_state()[1];

        if ((keyval == Gdk.KEY_Page_Up) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) {
            this.view.previous_page();
            return true;
        }

        if ((keyval == Gdk.KEY_Page_Down) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) {
            this.view.next_page();
            return true;
        }

        if (keyval == Gdk.KEY_Page_Up) {
            this.view.scroll(Gtk.ScrollType.PAGE_BACKWARD, false);
            return true;
        }

        if (keyval == Gdk.KEY_space ||
            keyval == Gdk.KEY_Page_Down) {
            this.view.scroll(Gtk.ScrollType.PAGE_FORWARD, false);
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

    setModel: function(model) {
        if (this._model == model)
            return;

        if (this.view)
            this.view.destroy();

        this._createView();
        this._model = model;

        if (this._model)
            this.view.set_model(this._model);
    },

    getModel: function() {
        return this._model;
    }
});

const PreviewThumbnails = new Lang.Class({
    Name: 'PreviewThumbnails',

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
});

const PreviewEmbed = new Lang.Class({
    Name: 'PreviewEmbed',

    _init: function(previewView, layout, parentActor) {
        this._motionTimeoutId = 0;

        let model = previewView.getModel();

        this._filter = new Gd.FullscreenFilter();
        this._filter.connect('motion-event', Lang.bind(this, this._fullscreenMotionHandler));
        this._filter.start();

        // create thumb bar
        this._thumbBar = new PreviewThumbnails(model);

        layout.add(this._thumbBar.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        let widthConstraint =
            new Clutter.BindConstraint({ source: parentActor,
                                         coordinate: Clutter.BindCoordinate.WIDTH,
                                         offset: - 300 });
        this._thumbBar.actor.add_constraint(widthConstraint);
        this._thumbBar.actor.connect('notify::width', Lang.bind(this,
            function() {
                let width = parentActor.width;
                let offset = 300;

                if (width > 1000)
                    offset += (width - 1000);
                else if (width < 600)
                    offset -= (600 - width);

                widthConstraint.offset = - offset;
            }));

        this._thumbBar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.X_AXIS,
                                          source: parentActor,
                                          factor: 0.50 }));
        this._thumbBar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.Y_AXIS,
                                          source: parentActor,
                                          factor: 0.95 }));

        // create toolbar
        this._fsToolbar = new MainToolbar.PreviewToolbar();
        this._fsToolbar.setModel(model);

        layout.add(this._fsToolbar.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        let vScrollbar = previewView.widget.get_vscrollbar();

        let sizeConstraint = new Clutter.BindConstraint
            ({ coordinate: Clutter.BindCoordinate.WIDTH,
               source: parentActor,
               offset: (vScrollbar.get_visible() ?
                        (- (vScrollbar.get_preferred_width()[1])) : 0 ) });

        // update the constraint size when the scrollbar changes visibility
        vScrollbar.connect('notify::visible',
            function() {
                sizeConstraint.offset = (vScrollbar.get_visible() ?
                                         (- (vScrollbar.get_preferred_width()[1])) : 0 );
            });

        this._fsToolbar.actor.add_constraint(sizeConstraint);
    },

    destroy: function() {
        if (this._motionTimeoutId != 0) {
            Mainloop.source_remove(this._motionTimeoutId);
            this._motionTimeoutId = 0;
        }

        this._filter.stop();

        this._thumbBar.actor.destroy();
        this._fsToolbar.widget.destroy();
    },

    _show: function() {
        this._fsToolbar.show();
        this._thumbBar.show();
    },

    _hide: function() {
        this._fsToolbar.hide();
        this._thumbBar.hide();
    },

    _fullscreenMotionHandler: function() {
        if (!Global.modeController.getFullscreen())
            return;

        // if we were idle fade in the toolbar, otherwise reset
        // the timeout
        if (this._motionTimeoutId == 0) {
            this._show();
        } else {
            Mainloop.source_remove(this._motionTimeoutId);
        }

        this._motionTimeoutId = Mainloop.timeout_add_seconds
            (_FULLSCREEN_TOOLBAR_TIMEOUT, Lang.bind(this,
                function() {
                    this._motionTimeoutId = 0;
                    this._hide();

                    return false;
            }));
    }
});
